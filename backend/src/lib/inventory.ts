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
 * Quantities are decimals with up to 4 places (kg, litres...). Every batch
 * update writes an exact rounded value and is guarded by the value that was
 * read, so concurrent changes are detected and floating-point dust never
 * accumulates.
 *
 * Inventory value is kept by stage: raw materials and packaging in one
 * account, finished goods in another (work in progress is handled by
 * production orders). inventoryAccountFor() picks the right one.
 *
 * Every function takes a Prisma transaction client so callers can combine
 * stock changes with accounting entries atomically.
 */
import { badRequest, AppError } from './errors';
import { postJournal, systemAccount, round2, SystemKey } from './ledger';
import { roundQty } from './accounts';

type Tx = any;

export const ITEM_TYPES = ['raw_material', 'packaging', 'finished_good'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** The inventory account a product's value is held in. */
export function stageKeyFor(itemType: string | null | undefined): SystemKey {
  return itemType === 'raw_material' || itemType === 'packaging' ? 'inventory_raw' : 'inventory';
}

export function inventoryAccountFor(tx: Tx, companyId: string, itemType: string | null | undefined) {
  return systemAccount(tx, companyId, stageKeyFor(itemType));
}

const CHANGED = () => new AppError(409, 'Stock changed while saving. Please try again.');

/** Set a batch's remaining quantity, only if it still has the value we read. */
async function setRemaining(tx: Tx, batchId: string, expected: number, next: number) {
  const { count } = await tx.inventoryBatch.updateMany({
    where: { id: batchId, quantityRemaining: expected },
    data: { quantityRemaining: roundQty(next) },
  });
  if (count === 0) throw CHANGED();
}

/** Batch filter for one product at a location (null = all locations). */
function batchWhere(companyId: string, productId: string, locationId: string | null) {
  return {
    companyId,
    productId,
    ...(locationId ? { locationId } : {}),
  };
}

/** Quantity of a product on hand at a location (null = whole company). */
export async function stockAt(tx: Tx, companyId: string, productId: string, locationId: string | null) {
  const agg = await tx.inventoryBatch.aggregate({
    where: { ...batchWhere(companyId, productId, locationId), quantityRemaining: { gt: 0 } },
    _sum: { quantityRemaining: true },
  });
  return roundQty(agg._sum.quantityRemaining ?? 0);
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
  for (const v of map.values()) {
    v.quantity = roundQty(v.quantity);
    v.value = round2(v.value);
  }
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
  /** receipt | opening | sale | return | damage | adjustment | count | supplier_return |
   *  production_issue | production_return | production_output */
  type: string;
  reference?: string | null;
  notes?: string | null;
}

/** Add stock as a new cost layer and record the movement. */
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
    productionOrderId?: string | null;
    sellingPriceSnapshot?: number;
    batchReference?: string | null;
    /** Keep a batch's original date when it moves location, so FIFO order holds. */
    receivedAt?: Date;
  } & MovementInfo
) {
  const quantity = roundQty(args.quantity);
  if (!(quantity > 0)) throw badRequest('Quantity to add must be greater than 0');
  const before = await stockAt(tx, args.companyId, args.productId, args.locationId);
  const batch = await tx.inventoryBatch.create({
    data: {
      companyId: args.companyId,
      locationId: args.locationId,
      productId: args.productId,
      supplierId: args.supplierId ?? null,
      purchaseId: args.purchaseId ?? null,
      productionOrderId: args.productionOrderId ?? null,
      quantityReceived: quantity,
      quantityRemaining: quantity,
      unitCost: args.unitCost,
      sellingPriceSnapshot: args.sellingPriceSnapshot ?? 0,
      reference: args.batchReference ?? args.reference ?? null,
      ...(args.receivedAt && { receivedAt: args.receivedAt }),
    },
  });
  const totalCost = round2(quantity * args.unitCost);
  const movement = await tx.stockMovement.create({
    data: {
      companyId: args.companyId,
      locationId: args.locationId,
      productId: args.productId,
      batchId: batch.id,
      type: args.type,
      quantity,
      balance: roundQty(before + quantity),
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
 * Returns the total cost removed and the per-batch lines (so the change can
 * be reversed exactly or traced).
 */
export async function consumeFifo(
  tx: Tx,
  args: {
    companyId: string;
    locationId: string | null;
    productId: string;
    productName?: string;
    unit?: string;
    quantity: number;
  } & MovementInfo
) {
  const { companyId, locationId, productId } = args;
  const quantity = roundQty(args.quantity);
  if (!(quantity > 0)) throw badRequest('Quantity to remove must be greater than 0');

  const batches = await tx.inventoryBatch.findMany({
    where: { ...batchWhere(companyId, productId, locationId), quantityRemaining: { gt: 0 } },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
  });
  const available = roundQty(batches.reduce((s: number, b: any) => s + b.quantityRemaining, 0));
  if (available < quantity) {
    const name = args.productName ?? 'this product';
    const unit = args.unit ? ` ${args.unit}` : '';
    throw badRequest(
      `Insufficient stock: only ${available}${unit} of ${name} available${locationId ? ' at this location' : ''}, ${quantity}${unit} needed`
    );
  }

  let remaining = quantity;
  let balance = available;
  let totalCost = 0;
  const lines: { batchId: string; quantity: number; unitCost: number; cost: number }[] = [];

  for (const b of batches) {
    if (remaining <= 0) break;
    const take = roundQty(Math.min(b.quantityRemaining, remaining));
    if (take <= 0) continue;
    await setRemaining(tx, b.id, b.quantityRemaining, b.quantityRemaining - take);

    const cost = round2(take * b.unitCost);
    balance = roundQty(balance - take);
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
    remaining = roundQty(remaining - take);
  }

  return { totalCost: round2(totalCost), lines };
}

/** Remove stock from one specific batch (e.g. returning a delivery to its supplier). */
export async function consumeFromBatch(
  tx: Tx,
  args: { companyId: string; batchId: string; quantity: number } & MovementInfo
) {
  const quantity = roundQty(args.quantity);
  const batch = await tx.inventoryBatch.findFirst({ where: { id: args.batchId, companyId: args.companyId } });
  if (!batch) throw badRequest('Batch not found');
  if (batch.quantityRemaining < quantity) {
    throw badRequest(`Only ${batch.quantityRemaining} left in that batch`);
  }
  await setRemaining(tx, batch.id, batch.quantityRemaining, batch.quantityRemaining - quantity);

  const after = await stockAt(tx, args.companyId, batch.productId, batch.locationId);
  const cost = round2(quantity * batch.unitCost);
  await tx.stockMovement.create({
    data: {
      companyId: args.companyId,
      locationId: batch.locationId,
      productId: batch.productId,
      batchId: batch.id,
      type: args.type,
      quantity: -quantity,
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
 * Put units back into the exact batch they came from (a cancelled sale,
 * unused production material), so the original cost layer is restored.
 */
export async function restoreToBatch(
  tx: Tx,
  args: { companyId: string; batchId: string; quantity: number } & MovementInfo
) {
  const quantity = roundQty(args.quantity);
  const batch = await tx.inventoryBatch.findFirst({ where: { id: args.batchId, companyId: args.companyId } });
  if (!batch) throw badRequest('Original batch not found');
  await setRemaining(tx, batch.id, batch.quantityRemaining, batch.quantityRemaining + quantity);

  const after = await stockAt(tx, args.companyId, batch.productId, batch.locationId);
  const cost = round2(quantity * batch.unitCost);
  await tx.stockMovement.create({
    data: {
      companyId: args.companyId,
      locationId: batch.locationId,
      productId: batch.productId,
      batchId: batch.id,
      type: args.type,
      quantity,
      balance: after,
      unitCost: batch.unitCost,
      totalCost: cost,
      reference: args.reference ?? null,
      notes: args.notes ?? null,
    },
  });
  return { batch, cost };
}

/** Weighted average unit cost of a product's stock at a location (falls back to `fallback`). */
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
 * Book a change in inventory value as a loss (positive amount) or a gain
 * (negative amount): write-offs, count differences, adjustments.
 *   loss: Dr Inventory Loss / Cr the product's inventory account
 *   gain: Dr the product's inventory account / Cr Inventory Loss
 */
export async function postInventoryLoss(
  tx: Tx,
  args: {
    companyId: string;
    locationId: string | null;
    itemType: string;
    amount: number;
    description: string;
    sourceType?: string;
    sourceId?: string | null;
    reference?: string | null;
  }
) {
  const amount = round2(args.amount);
  if (amount === 0) return;
  const inventory = await inventoryAccountFor(tx, args.companyId, args.itemType);
  const loss = await systemAccount(tx, args.companyId, 'inventory_loss');
  await postJournal(tx, {
    companyId: args.companyId,
    locationId: args.locationId,
    description: args.description,
    sourceType: args.sourceType ?? 'stock_adjustment',
    sourceId: args.sourceId,
    reference: args.reference,
    lines: [
      { accountId: loss.id, debit: amount },
      { accountId: inventory.id, credit: amount },
    ],
  });
}

/** Opening stock brought in at cost: Dr inventory (by type) / Cr Opening Balance Equity. */
export async function postOpeningStock(
  tx: Tx,
  args: { companyId: string; locationId: string | null; itemType: string; amount: number; description: string; sourceId?: string | null }
) {
  const amount = round2(args.amount);
  if (amount <= 0) return;
  const inventory = await inventoryAccountFor(tx, args.companyId, args.itemType);
  const equity = await systemAccount(tx, args.companyId, 'opening_equity');
  await postJournal(tx, {
    companyId: args.companyId,
    locationId: args.locationId,
    description: args.description,
    sourceType: 'opening_stock',
    sourceId: args.sourceId,
    lines: [
      { accountId: inventory.id, debit: amount },
      { accountId: equity.id, credit: amount },
    ],
  });
}
