/**
 * Inventory service — the ONLY place that changes stock.
 *
 * Source of truth: InventoryBatch rows. Each batch is a cost layer at one
 * location (quantityRemaining × unitCost). Stock at a location is the sum of
 * its batches; company stock is the sum over all locations.
 *
 * Product.quantity and Product.totalCostValue are cached company-wide totals.
 * They are recomputed from batches by syncProductTotals() after every change
 * and must never be edited directly.
 *
 * Every function takes a Prisma transaction client so callers can combine
 * stock changes with accounting entries atomically.
 */
import { badRequest, AppError } from './errors';
import { findOrCreateAccount } from './accounts';

type Tx = any;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Batch filter for one product at a location (null = all locations). */
function batchWhere(companyId: string, productId: string, locationId: string | null) {
  return {
    companyId,
    productId,
    ...(locationId ? { locationId } : {}),
  };
}

/** Units of a product on hand at a location (null = whole company). */
export async function stockAt(tx: Tx, companyId: string, productId: string, locationId: string | null) {
  const agg = await tx.inventoryBatch.aggregate({
    where: { ...batchWhere(companyId, productId, locationId), quantityRemaining: { gt: 0 } },
    _sum: { quantityRemaining: true },
  });
  return agg._sum.quantityRemaining ?? 0;
}

/**
 * Stock on hand per product, from batches. Pass a location to get stock at
 * that location, or an array of locations / null for the combined total.
 * Returns a map productId → { quantity, value }.
 */
export async function stockByProduct(
  tx: Tx,
  companyId: string,
  location: string | string[] | null,
  productIds?: string[]
) {
  const where: any = { companyId, quantityRemaining: { gt: 0 } };
  if (typeof location === 'string') where.locationId = location;
  else if (Array.isArray(location)) where.locationId = { in: location };
  if (productIds) where.productId = { in: productIds };

  const batches = await tx.inventoryBatch.findMany({
    where,
    select: { productId: true, quantityRemaining: true, unitCost: true },
  });
  const map = new Map<string, { quantity: number; value: number }>();
  for (const b of batches) {
    const cur = map.get(b.productId) || { quantity: 0, value: 0 };
    cur.quantity += b.quantityRemaining;
    cur.value += b.quantityRemaining * b.unitCost;
    map.set(b.productId, cur);
  }
  for (const v of map.values()) v.value = round2(v.value);
  return map;
}

/** Recompute the cached company-wide totals on Product from its batches. */
export async function syncProductTotals(tx: Tx, companyId: string, productIds: string[]) {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  if (unique.length === 0) return;
  const totals = await stockByProduct(tx, companyId, null, unique);
  for (const pid of unique) {
    const t = totals.get(pid) || { quantity: 0, value: 0 };
    await tx.product.updateMany({
      where: { id: pid, companyId },
      data: { quantity: t.quantity, totalCostValue: t.value },
    });
  }
}

interface MovementInfo {
  type: string; // receipt | opening | sale | return | damage | adjustment | count | supplier_return
  reference?: string | null;
  notes?: string | null;
}

/**
 * Add stock as a new cost layer and record the movement.
 * Returns the batch and the movement.
 */
export async function addStock(
  tx: Tx,
  args: {
    companyId: string;
    locationId: string | null;
    productId: string;
    quantity: number;
    unitCost: number;
    supplierId?: string | null;
    purchaseId?: string | null;
    sellingPriceSnapshot?: number;
    batchReference?: string | null;
  } & MovementInfo
) {
  if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
    throw badRequest('Quantity to add must be a whole number greater than 0');
  }
  const before = await stockAt(tx, args.companyId, args.productId, args.locationId);
  const batch = await tx.inventoryBatch.create({
    data: {
      companyId: args.companyId,
      locationId: args.locationId,
      productId: args.productId,
      supplierId: args.supplierId ?? null,
      purchaseId: args.purchaseId ?? null,
      quantityReceived: args.quantity,
      quantityRemaining: args.quantity,
      unitCost: args.unitCost,
      sellingPriceSnapshot: args.sellingPriceSnapshot ?? 0,
      reference: args.batchReference ?? args.reference ?? null,
    },
  });
  const totalCost = round2(args.quantity * args.unitCost);
  const movement = await tx.stockMovement.create({
    data: {
      companyId: args.companyId,
      locationId: args.locationId,
      productId: args.productId,
      batchId: batch.id,
      type: args.type,
      quantity: args.quantity,
      balance: before + args.quantity,
      unitCost: args.unitCost,
      totalCost,
      reference: args.reference ?? null,
      notes: args.notes ?? null,
    },
  });
  return { batch, movement, totalCost };
}

/**
 * Remove stock oldest-batch-first (FIFO) at one location and record one
 * movement per batch touched. Throws 400 if the location does not have
 * enough stock — it never removes part of the quantity.
 *
 * Returns the total cost removed (for COGS / write-off value) and the
 * per-batch lines so the change can be reversed exactly.
 */
export async function consumeFifo(
  tx: Tx,
  args: {
    companyId: string;
    locationId: string | null;
    productId: string;
    productName?: string;
    quantity: number;
  } & MovementInfo
) {
  const { companyId, locationId, productId, quantity } = args;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw badRequest('Quantity to remove must be a whole number greater than 0');
  }

  const batches = await tx.inventoryBatch.findMany({
    where: { ...batchWhere(companyId, productId, locationId), quantityRemaining: { gt: 0 } },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
  });
  const available = batches.reduce((s: number, b: any) => s + b.quantityRemaining, 0);
  if (available < quantity) {
    const name = args.productName ? `${args.productName}` : 'this product';
    throw badRequest(
      `Insufficient stock: only ${available} of ${name} available${locationId ? ' at this location' : ''}, ${quantity} needed`
    );
  }

  let remaining = quantity;
  let balance = available;
  let totalCost = 0;
  const lines: { batchId: string; quantity: number; unitCost: number; cost: number }[] = [];

  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantityRemaining, remaining);

    // Guarded decrement: fails if another request consumed this batch
    // after we read it, so two sales can never oversell the same units.
    const { count } = await tx.inventoryBatch.updateMany({
      where: { id: b.id, quantityRemaining: { gte: take } },
      data: { quantityRemaining: { decrement: take } },
    });
    if (count === 0) {
      throw new AppError(409, 'Stock changed while saving. Please try again.');
    }

    const cost = round2(take * b.unitCost);
    balance -= take;
    totalCost += cost;
    lines.push({ batchId: b.id, quantity: take, unitCost: b.unitCost, cost });

    await tx.stockMovement.create({
      data: {
        companyId,
        locationId: b.locationId,
        productId,
        batchId: b.id,
        type: args.type,
        quantity: -take,
        balance,
        unitCost: b.unitCost,
        totalCost: cost,
        reference: args.reference ?? null,
        notes: args.notes ?? null,
      },
    });
    remaining -= take;
  }

  return { totalCost: round2(totalCost), lines };
}

/**
 * Remove stock from one specific batch (e.g. returning a delivery to its
 * supplier). Throws 400 if the batch does not hold enough.
 */
export async function consumeFromBatch(
  tx: Tx,
  args: { companyId: string; batchId: string; quantity: number } & MovementInfo
) {
  const batch = await tx.inventoryBatch.findFirst({ where: { id: args.batchId, companyId: args.companyId } });
  if (!batch) throw badRequest('Batch not found');
  if (batch.quantityRemaining < args.quantity) {
    throw badRequest(`Only ${batch.quantityRemaining} left in that batch`);
  }
  const { count } = await tx.inventoryBatch.updateMany({
    where: { id: batch.id, quantityRemaining: { gte: args.quantity } },
    data: { quantityRemaining: { decrement: args.quantity } },
  });
  if (count === 0) throw new AppError(409, 'Stock changed while saving. Please try again.');

  const after = await stockAt(tx, args.companyId, batch.productId, batch.locationId);
  const cost = round2(args.quantity * batch.unitCost);
  await tx.stockMovement.create({
    data: {
      companyId: args.companyId,
      locationId: batch.locationId,
      productId: batch.productId,
      batchId: batch.id,
      type: args.type,
      quantity: -args.quantity,
      balance: after,
      unitCost: batch.unitCost,
      totalCost: cost,
      reference: args.reference ?? null,
      notes: args.notes ?? null,
    },
  });
  return { batch, cost };
}

/**
 * Put units back into the exact batch they came from (used when a sale is
 * cancelled), so the original cost layer is restored.
 */
export async function restoreToBatch(
  tx: Tx,
  args: { companyId: string; batchId: string; quantity: number } & MovementInfo
) {
  const batch = await tx.inventoryBatch.findFirst({ where: { id: args.batchId, companyId: args.companyId } });
  if (!batch) throw badRequest('Original batch not found');
  await tx.inventoryBatch.update({
    where: { id: batch.id },
    data: { quantityRemaining: { increment: args.quantity } },
  });
  const after = await stockAt(tx, args.companyId, batch.productId, batch.locationId);
  const cost = round2(args.quantity * batch.unitCost);
  await tx.stockMovement.create({
    data: {
      companyId: args.companyId,
      locationId: batch.locationId,
      productId: batch.productId,
      batchId: batch.id,
      type: args.type,
      quantity: args.quantity,
      balance: after,
      unitCost: batch.unitCost,
      totalCost: cost,
      reference: args.reference ?? null,
      notes: args.notes ?? null,
    },
  });
  return { batch, cost };
}

/** Weighted average unit cost of a product's stock at a location (falls back to product.cost). */
export async function averageCost(
  tx: Tx,
  companyId: string,
  productId: string,
  locationId: string | null,
  fallback: number
) {
  const map = await stockByProduct(tx, companyId, locationId, [productId]);
  const s = map.get(productId);
  if (!s || s.quantity <= 0) return fallback;
  return round2(s.value / s.quantity);
}

/**
 * Post a change in inventory value that is a loss (positive amount) or a
 * gain (negative amount): write-offs, count differences, adjustments.
 * Inventory moves by -amount; "Inventory Loss" (an operating expense) moves
 * by +amount, so gains reduce the period's losses.
 */
export async function postInventoryLoss(
  tx: Tx,
  args: { companyId: string; locationId: string | null; amount: number; description: string }
) {
  const amount = round2(args.amount);
  if (amount === 0) return;
  const inventory = await findOrCreateAccount(tx, args.companyId, 'Inventory', 'asset');
  const loss = await findOrCreateAccount(tx, args.companyId, 'Inventory Loss', 'expense');
  await tx.account.update({ where: { id: inventory.id }, data: { balance: { decrement: amount } } });
  await tx.account.update({ where: { id: loss.id }, data: { balance: { increment: amount } } });
  await tx.transaction.create({
    data: {
      companyId: args.companyId,
      locationId: args.locationId,
      accountId: loss.id,
      type: 'expense',
      description: args.description,
      amount,
    },
  });
}

/** Increase the Inventory asset (stock added at a cost, e.g. opening stock). */
export async function postInventoryIncrease(
  tx: Tx,
  args: { companyId: string; locationId: string | null; amount: number; description: string }
) {
  const amount = round2(args.amount);
  if (amount <= 0) return;
  const inventory = await findOrCreateAccount(tx, args.companyId, 'Inventory', 'asset');
  await tx.account.update({ where: { id: inventory.id }, data: { balance: { increment: amount } } });
  await tx.transaction.create({
    data: {
      companyId: args.companyId,
      locationId: args.locationId,
      accountId: inventory.id,
      type: 'inventory',
      description: args.description,
      amount,
    },
  });
}
