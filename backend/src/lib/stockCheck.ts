/**
 * Stock check: compares the cached product totals with the batches (the
 * source of truth) and reports anything inconsistent. runStockCheck() never
 * writes. fixSafeStockIssues() only applies fixes that cannot lose
 * information; real disagreements between the two numbers need a physical
 * count, which the user records with POST /stock/count.
 */
import { prisma } from './prisma';
import { stockByProduct, syncProductTotals } from './inventory';

const round2 = (n: number) => Math.round(n * 100) / 100;

export type StockIssueType =
  | 'batch_without_location'   // fixable: assign to the default location
  | 'stock_without_batches'    // fixable: create an opening batch for the units
  | 'value_out_of_date'        // fixable: recompute the cached cost value
  | 'quantity_mismatch'        // needs a physical count
  | 'negative_batch';          // needs investigation

export interface StockIssue {
  type: StockIssueType;
  fixable: boolean;
  productId: string;
  productName: string;
  message: string;
  recordedQuantity?: number; // Product.quantity (cached)
  batchQuantity?: number;    // sum of batches
  units?: number;
}

export async function runStockCheck(companyId: string) {
  const [products, defaultLocation, inventoryAccount] = await Promise.all([
    prisma.product.findMany({
      where: { companyId },
      select: { id: true, name: true, sku: true, quantity: true, totalCostValue: true, cost: true },
      orderBy: { name: 'asc' },
    }),
    prisma.location.findFirst({ where: { companyId, isDefault: true }, select: { id: true, name: true } }),
    prisma.account.findFirst({ where: { companyId, systemKey: 'inventory' }, select: { balance: true } }),
  ]);

  const totals = await stockByProduct(prisma, companyId, null);
  const batchCounts = await prisma.inventoryBatch.groupBy({
    by: ['productId'],
    where: { companyId },
    _count: true,
  });
  const hasBatches = new Set(batchCounts.map((b) => b.productId));
  const issues: StockIssue[] = [];

  // Batches with stock but no location
  const unlocated = await prisma.inventoryBatch.groupBy({
    by: ['productId'],
    where: { companyId, locationId: null, quantityRemaining: { gt: 0 } },
    _sum: { quantityRemaining: true },
    _count: true,
  });
  const nameOf = new Map(products.map((p) => [p.id, p.name]));
  for (const u of unlocated) {
    issues.push({
      type: 'batch_without_location',
      fixable: !!defaultLocation,
      productId: u.productId,
      productName: nameOf.get(u.productId) || 'Unknown product',
      units: u._sum.quantityRemaining ?? 0,
      message:
        `${u._sum.quantityRemaining} units in ${u._count} batch(es) have no location, so sales at a ` +
        `location cannot use them.${defaultLocation ? ` Fix: assign them to "${defaultLocation.name}".` : ''}`,
    });
  }

  // Negative batches (should be impossible; reported if old bugs caused it)
  const negative = await prisma.inventoryBatch.findMany({
    where: { companyId, quantityRemaining: { lt: 0 } },
    select: { productId: true, quantityRemaining: true },
  });
  for (const n of negative) {
    issues.push({
      type: 'negative_batch',
      fixable: false,
      productId: n.productId,
      productName: nameOf.get(n.productId) || 'Unknown product',
      units: n.quantityRemaining,
      message: `A batch has ${n.quantityRemaining} units remaining. Count this product to correct it.`,
    });
  }

  let batchValueTotal = 0;
  const rows = products.map((p) => {
    const t = totals.get(p.id) || { quantity: 0, value: 0 };
    batchValueTotal += t.value;
    const hasAnyBatch = hasBatches.has(p.id);

    if (p.quantity !== t.quantity) {
      if (!hasAnyBatch && p.quantity > 0) {
        issues.push({
          type: 'stock_without_batches',
          fixable: !!defaultLocation,
          productId: p.id,
          productName: p.name,
          recordedQuantity: p.quantity,
          batchQuantity: 0,
          message:
            `Recorded as ${p.quantity} in stock but has no stock batches, so it cannot be sold. ` +
            `Fix: create an opening batch of ${p.quantity} at the product's cost price.`,
        });
      } else {
        issues.push({
          type: 'quantity_mismatch',
          fixable: false,
          productId: p.id,
          productName: p.name,
          recordedQuantity: p.quantity,
          batchQuantity: t.quantity,
          message:
            `Product shows ${p.quantity} but its batches add up to ${t.quantity}. ` +
            'Count the stock and record the counted quantity.',
        });
      }
    } else if (Math.abs(p.totalCostValue - t.value) > 0.01) {
      issues.push({
        type: 'value_out_of_date',
        fixable: true,
        productId: p.id,
        productName: p.name,
        message: `Stored stock value ${round2(p.totalCostValue)} differs from the batch value ${t.value}.`,
      });
    }

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      recordedQuantity: p.quantity,
      batchQuantity: t.quantity,
      recordedValue: round2(p.totalCostValue),
      batchValue: t.value,
    };
  });

  const inventoryAccountBalance = round2(inventoryAccount?.balance ?? 0);
  batchValueTotal = round2(batchValueTotal);

  return {
    checkedAt: new Date().toISOString(),
    defaultLocation,
    summary: {
      products: products.length,
      issues: issues.length,
      fixable: issues.filter((i) => i.fixable).length,
      needsCount: issues.filter((i) => !i.fixable).length,
      batchValueTotal,
      inventoryAccountBalance,
      // Accounting difference — informational until the ledger rework (Phase 2).
      inventoryAccountDifference: round2(inventoryAccountBalance - batchValueTotal),
    },
    issues,
    products: rows,
  };
}

/**
 * Apply only the safe fixes reported by runStockCheck():
 *  1. batches with no location → default location
 *  2. stock recorded on a product with no batches → opening batch at product cost
 *  3. cached totals recomputed from batches for the products touched and for
 *     products whose only problem is an out-of-date value
 * Quantity mismatches are left for a physical count.
 */
export async function fixSafeStockIssues(companyId: string) {
  const report = await runStockCheck(companyId);
  const location = report.defaultLocation;

  return prisma.$transaction(async (tx) => {
    const touched = new Set<string>();
    let batchesAssigned = 0;
    let openingBatchesCreated = 0;

    if (location) {
      const unlocatedIds = report.issues
        .filter((i) => i.type === 'batch_without_location')
        .map((i) => i.productId);
      if (unlocatedIds.length) {
        const r = await tx.inventoryBatch.updateMany({
          where: { companyId, locationId: null },
          data: { locationId: location.id },
        });
        batchesAssigned = r.count;
        unlocatedIds.forEach((id) => touched.add(id));
      }

      for (const issue of report.issues.filter((i) => i.type === 'stock_without_batches')) {
        const product = await tx.product.findFirst({ where: { id: issue.productId, companyId } });
        // Re-check inside the transaction in case stock changed since the report.
        if (!product || product.quantity <= 0) continue;
        const existing = await tx.inventoryBatch.count({ where: { companyId, productId: product.id } });
        if (existing > 0) continue;

        const batch = await tx.inventoryBatch.create({
          data: {
            companyId,
            locationId: location.id,
            productId: product.id,
            quantityReceived: product.quantity,
            quantityRemaining: product.quantity,
            unitCost: product.cost,
            sellingPriceSnapshot: product.price,
            reference: 'Opening balance (stock check)',
            isLegacy: true,
          },
        });
        await tx.stockMovement.create({
          data: {
            companyId,
            locationId: location.id,
            productId: product.id,
            batchId: batch.id,
            type: 'opening',
            quantity: product.quantity,
            balance: product.quantity,
            unitCost: product.cost,
            totalCost: round2(product.quantity * product.cost),
            reference: 'Opening balance (stock check)',
            notes: 'Created by stock check: stock existed on the product but had no batch',
          },
        });
        openingBatchesCreated++;
        touched.add(product.id);
      }
    }

    report.issues.filter((i) => i.type === 'value_out_of_date').forEach((i) => touched.add(i.productId));
    await syncProductTotals(tx, companyId, Array.from(touched));

    return {
      batchesAssigned,
      openingBatchesCreated,
      productsResynced: touched.size,
      leftForCount: report.issues.filter((i) => !i.fixable).length,
    };
  });
}
