/**
 * Manufacturing: bills of materials and production orders.
 *
 * Flow (all quantities decimal, all money through the double-entry ledger):
 *   draft        requirements copied from the BOM; nothing moves yet
 *   start        materials issued FIFO from their batches at the order's location
 *                Dr Work in Progress / Cr Raw Materials (or the material's stage)
 *   issue more   same as start, for extra material
 *   return       unused material goes back to the exact batches it came from
 *                Dr Raw Materials / Cr Work in Progress
 *   complete     finished goods enter stock as one batch at actual cost per unit
 *                Dr Finished Goods / Cr Work in Progress
 *                (nothing produced: the whole cost is written off to Inventory Loss)
 *   cancel       a running order returns all its material; drafts just close
 *
 * Normal waste is absorbed into the cost of the good units. Waste is reported
 * as quantities: output shortfall against plan and material used above the
 * BOM standard for what was actually produced.
 */
import { depositAvailable, withAvailable } from '../../lib/deposits';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { parsePositiveQuantity, parseQuantity, roundQty } from '../../lib/accounts';
import { postJournal, systemAccount, round2 } from '../../lib/ledger';
import {
  addStock, consumeFifo, restoreToBatch, syncProductTotals, stockAt, stockByProduct, inventoryAccountFor,
} from '../../lib/inventory';

type Tx = any;

// =====================================================================
// Bills of materials
// =====================================================================

export interface BomLineInput {
  componentId: unknown;
  quantity: unknown;
  scrapPercent?: unknown;
}

async function validateBom(companyId: string, productId: unknown, outputQuantity: unknown, lines: unknown, bomId?: string) {
  if (typeof productId !== 'string' || !productId) throw badRequest('Choose the product this BOM makes');
  const product = await prisma.product.findFirst({ where: { id: productId, companyId } });
  if (!product) throw notFound('Product not found');
  if (product.itemType !== 'finished_good') throw badRequest(`${product.name} is not a finished good`);
  const existing = await prisma.bom.findFirst({ where: { companyId, productId } });
  if (existing && existing.id !== bomId) throw badRequest(`${product.name} already has a bill of materials`);

  const output = parsePositiveQuantity(outputQuantity, 'Output quantity');
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('Add at least one material');
  const seen = new Set<string>();
  const clean = (lines as BomLineInput[]).map((l, i) => {
    const componentId = typeof l?.componentId === 'string' ? l.componentId : '';
    if (!componentId) throw badRequest(`Line ${i + 1}: choose a material`);
    if (componentId === productId) throw badRequest(`Line ${i + 1}: a product can't be made from itself`);
    if (seen.has(componentId)) throw badRequest(`Line ${i + 1}: this material is already listed`);
    seen.add(componentId);
    const scrap = l?.scrapPercent === undefined || l?.scrapPercent === '' ? 0 : Number(l.scrapPercent);
    if (!Number.isFinite(scrap) || scrap < 0 || scrap > 100) throw badRequest(`Line ${i + 1}: scrap % must be between 0 and 100`);
    return {
      componentId,
      quantity: parsePositiveQuantity(l?.quantity, `Line ${i + 1} quantity`),
      scrapPercent: round2(scrap),
      sortOrder: i,
    };
  });
  const owned = await prisma.product.count({ where: { companyId, id: { in: clean.map((c) => c.componentId) } } });
  if (owned !== clean.length) throw notFound('One or more materials were not found');
  return { product, output, lines: clean };
}

const bomInclude = {
  product: { select: { id: true, name: true, sku: true, unit: true, price: true } },
  lines: {
    orderBy: { sortOrder: 'asc' as const },
    include: { component: { select: { id: true, name: true, sku: true, unit: true, itemType: true, cost: true } } },
  },
};

/** Add per-unit requirements and an estimated cost (from current stock costs) to a BOM. */
async function withEstimate(companyId: string, bom: any) {
  const ids = bom.lines.map((l: any) => l.componentId);
  const stock = await stockByProduct(prisma, companyId, null, ids);
  let unitCost = 0;
  const lines = bom.lines.map((l: any) => {
    const perUnit = (l.quantity * (1 + l.scrapPercent / 100)) / bom.outputQuantity;
    const s = stock.get(l.componentId);
    const cost = s && s.quantity > 0 ? s.value / s.quantity : l.component.cost;
    unitCost += perUnit * cost;
    return { ...l, perUnit: roundQty(perUnit), unitCost: round2(cost), costPerOutputUnit: round2(perUnit * cost) };
  });
  return { ...bom, lines, estimatedUnitCost: round2(unitCost) };
}

export async function listBoms(companyId: string) {
  const boms = await prisma.bom.findMany({ where: { companyId }, include: bomInclude, orderBy: { createdAt: 'asc' } });
  return Promise.all(boms.map((b) => withEstimate(companyId, b)));
}

export async function getBom(companyId: string, id: string) {
  const bom = await prisma.bom.findFirst({ where: { id, companyId }, include: bomInclude });
  if (!bom) throw notFound('Bill of materials not found');
  return withEstimate(companyId, bom);
}

export async function saveBom(companyId: string, body: any, id?: string) {
  if (id) {
    const existing = await prisma.bom.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound('Bill of materials not found');
  }
  const v = await validateBom(companyId, body?.productId, body?.outputQuantity, body?.lines, id);
  const saved = await prisma.$transaction(async (tx) => {
    if (id) {
      await tx.bomLine.deleteMany({ where: { bomId: id } });
      return tx.bom.update({
        where: { id },
        data: { productId: v.product.id, outputQuantity: v.output, notes: body?.notes ?? null, lines: { create: v.lines } },
      });
    }
    return tx.bom.create({
      data: { companyId, productId: v.product.id, outputQuantity: v.output, notes: body?.notes ?? null, lines: { create: v.lines } },
    });
  });
  return getBom(companyId, saved.id);
}

export async function deleteBom(companyId: string, id: string) {
  const { count } = await prisma.bom.deleteMany({ where: { id, companyId } });
  if (count === 0) throw notFound('Bill of materials not found');
}

// =====================================================================
// Planning
// =====================================================================

/** Materials needed to make `quantity` of a product, with availability and estimated cost. */
export async function planRequirements(companyId: string, productId: string, quantity: number, locationId: string | null) {
  const bom = await prisma.bom.findFirst({ where: { companyId, productId }, include: bomInclude });
  if (!bom) throw badRequest('This product has no bill of materials yet. Create one under Production → Bills of materials.');
  const est = await withEstimate(companyId, bom);
  const materials = await Promise.all(
    est.lines.map(async (l: any) => {
      const required = roundQty(l.perUnit * quantity);
      const available = await stockAt(prisma, companyId, l.componentId, locationId);
      return {
        productId: l.componentId,
        name: l.component.name,
        unit: l.component.unit,
        itemType: l.component.itemType,
        required,
        available,
        shortage: roundQty(Math.max(0, required - available)),
        estimatedCost: round2(required * l.unitCost),
      };
    })
  );
  return {
    product: bom.product,
    bomId: bom.id,
    quantity,
    materials,
    canStart: materials.every((m) => m.shortage === 0),
    estimatedCost: round2(materials.reduce((s, m) => s + m.estimatedCost, 0)),
    estimatedUnitCost: est.estimatedUnitCost,
  };
}

// =====================================================================
// Production orders
// =====================================================================

async function nextOrderNumber(companyId: string) {
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("number" FROM 4) AS INTEGER)) AS max
    FROM "production_orders"
    WHERE "companyId" = ${companyId} AND "number" ~ '^MO-[0-9]{1,7}$'`;
  return `MO-${String(Number(rows[0]?.max ?? 0) + 1).padStart(4, '0')}`;
}

/** Lock a running order for this transaction; throws if it is not running. */
async function lockRunning(tx: Tx, companyId: string, id: string) {
  const { count } = await tx.productionOrder.updateMany({
    where: { id, companyId, status: 'in_progress' },
    data: { updatedAt: new Date() },
  });
  if (count === 0) {
    const o = await tx.productionOrder.findFirst({ where: { id, companyId }, select: { status: true } });
    if (!o) throw notFound('Production order not found');
    throw badRequest(`This order is ${o.status.replace('_', ' ')}, not in progress`);
  }
  return tx.productionOrder.findFirst({ where: { id }, include: { materials: true, product: true } });
}

export async function createOrder(
  companyId: string,
  userId: string,
  locationId: string,
  body: { productId?: unknown; plannedQuantity?: unknown; plannedDate?: unknown; notes?: unknown; customerId?: unknown; unitPrice?: unknown }
) {
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const product = await prisma.product.findFirst({ where: { id: productId, companyId } });
  if (!product) throw notFound('Product not found');
  const { customerId, unitPrice } = await orderCustomer(companyId, body);
  const quantity = parsePositiveQuantity(body.plannedQuantity, 'Planned quantity');
  const plan = await planRequirements(companyId, product.id, quantity, locationId);

  for (let attempt = 0; ; attempt++) {
    const number = await nextOrderNumber(companyId);
    try {
      const order = await prisma.productionOrder.create({
        data: {
          companyId,
          locationId,
          number,
          productId: product.id,
          plannedQuantity: quantity,
          customerId,
          unitPrice,
          plannedDate: typeof body.plannedDate === 'string' && body.plannedDate ? new Date(body.plannedDate) : null,
          notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
          createdById: userId,
          materials: { create: plan.materials.map((m) => ({ productId: m.productId, plannedQuantity: m.required })) },
        },
      });
      return order;
    } catch (err: any) {
      if (err?.code === 'P2002' && attempt < 5) continue;
      throw err;
    }
  }
}

/** Customer and agreed price per unit for a made-to-order run (both optional). */
async function orderCustomer(companyId: string, body: { customerId?: unknown; unitPrice?: unknown }) {
  let customerId: string | null = null;
  if (body.customerId) {
    const c = await prisma.customer.findFirst({ where: { id: String(body.customerId), companyId }, select: { id: true } });
    if (!c) throw notFound('Customer not found');
    customerId = c.id;
  }
  let unitPrice: number | null = null;
  if (body.unitPrice !== undefined && body.unitPrice !== null && body.unitPrice !== '') {
    unitPrice = Number(body.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw badRequest('Price per unit must be 0 or more');
    unitPrice = round2(unitPrice);
  }
  return { customerId, unitPrice };
}

/** Change a draft's quantity (requirements are recalculated from the BOM), date or notes. */
export async function updateDraft(companyId: string, id: string, body: { plannedQuantity?: unknown; plannedDate?: unknown; notes?: unknown; customerId?: unknown; unitPrice?: unknown }) {
  const order = await prisma.productionOrder.findFirst({ where: { id, companyId } });
  if (!order) throw notFound('Production order not found');
  if (order.status !== 'draft') throw badRequest('Only draft orders can be edited');
  const quantity = body.plannedQuantity !== undefined ? parsePositiveQuantity(body.plannedQuantity, 'Planned quantity') : order.plannedQuantity;
  const plan = await planRequirements(companyId, order.productId, quantity, order.locationId);
  await prisma.$transaction(async (tx) => {
    await tx.productionMaterial.deleteMany({ where: { orderId: order.id } });
    await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        plannedQuantity: quantity,
        ...(body.plannedDate !== undefined && { plannedDate: body.plannedDate ? new Date(String(body.plannedDate)) : null }),
        ...(body.notes !== undefined && { notes: body.notes ? String(body.notes) : null }),
        ...(body.customerId !== undefined && { customerId: (await orderCustomer(companyId, { customerId: body.customerId })).customerId }),
        ...(body.unitPrice !== undefined && { unitPrice: (await orderCustomer(companyId, { unitPrice: body.unitPrice })).unitPrice }),
        materials: { create: plan.materials.map((m) => ({ productId: m.productId, plannedQuantity: m.required })) },
      },
    });
  });
}

/** Issue material into work in progress (FIFO from the order's location). */
async function issueMaterial(tx: Tx, order: any, material: any, quantity: number, userId: string) {
  const product = await tx.product.findFirst({ where: { id: material.productId, companyId: order.companyId } });
  if (!product) throw notFound('Material not found');
  const { totalCost, lines } = await consumeFifo(tx, {
    companyId: order.companyId,
    locationId: order.locationId,
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    quantity,
    type: 'production_issue',
    reference: order.number,
  });
  for (const l of lines) {
    await tx.productionIssue.create({
      data: { materialId: material.id, batchId: l.batchId, quantity: l.quantity, unitCost: l.unitCost },
    });
  }
  await tx.productionMaterial.update({
    where: { id: material.id },
    data: { issuedQuantity: roundQty(material.issuedQuantity + quantity), issuedCost: round2(material.issuedCost + totalCost) },
  });
  await tx.productionOrder.update({ where: { id: order.id }, data: { materialCost: { increment: totalCost } } });

  const wip = await systemAccount(tx, order.companyId, 'inventory_wip');
  const stock = await inventoryAccountFor(tx, order.companyId, product.itemType);
  await postJournal(tx, {
    companyId: order.companyId,
    locationId: order.locationId,
    description: `${order.number}: ${roundQty(quantity)} ${product.unit} ${product.name} into production`,
    sourceType: 'production_issue',
    sourceId: order.id,
    reference: order.number,
    createdById: userId,
    lines: [
      { accountId: wip.id, debit: totalCost },
      { accountId: stock.id, credit: totalCost },
    ],
  });
  await syncProductTotals(tx, order.companyId, [product.id]);
  return totalCost;
}

/**
 * Give unused material back: newest issued batches first, each to the batch
 * it came from at its original cost.
 */
async function returnMaterial(tx: Tx, order: any, material: any, quantity: number, userId: string, note: string) {
  if (quantity > material.issuedQuantity + 0.00001) {
    throw badRequest(`Only ${material.issuedQuantity} was issued; you can't return more than that`);
  }
  const product = await tx.product.findFirst({ where: { id: material.productId, companyId: order.companyId } });
  const issues = await tx.productionIssue.findMany({ where: { materialId: material.id }, orderBy: { createdAt: 'asc' } });
  // Net quantity still out per batch, in issue order.
  const net = new Map<string, { qty: number; unitCost: number }>();
  for (const i of issues) {
    const cur = net.get(i.batchId) || { qty: 0, unitCost: i.unitCost };
    cur.qty = roundQty(cur.qty + i.quantity);
    net.set(i.batchId, cur);
  }
  let remaining = roundQty(quantity);
  let cost = 0;
  for (const [batchId, v] of Array.from(net.entries()).reverse()) {
    if (remaining <= 0) break;
    const back = roundQty(Math.min(v.qty, remaining));
    if (back <= 0) continue;
    await restoreToBatch(tx, {
      companyId: order.companyId, batchId, quantity: back, type: 'production_return', reference: order.number, notes: note,
    });
    await tx.productionIssue.create({ data: { materialId: material.id, batchId, quantity: -back, unitCost: v.unitCost } });
    cost += round2(back * v.unitCost);
    remaining = roundQty(remaining - back);
  }
  cost = round2(cost);
  await tx.productionMaterial.update({
    where: { id: material.id },
    data: { issuedQuantity: roundQty(material.issuedQuantity - quantity), issuedCost: round2(material.issuedCost - cost) },
  });
  await tx.productionOrder.update({ where: { id: order.id }, data: { materialCost: { decrement: cost } } });

  const wip = await systemAccount(tx, order.companyId, 'inventory_wip');
  const stock = await inventoryAccountFor(tx, order.companyId, product?.itemType);
  await postJournal(tx, {
    companyId: order.companyId,
    locationId: order.locationId,
    description: `${order.number}: ${roundQty(quantity)} ${product?.unit ?? ''} ${product?.name ?? 'material'} returned to stock`,
    sourceType: 'production_return',
    sourceId: order.id,
    reference: order.number,
    createdById: userId,
    lines: [
      { accountId: stock.id, debit: cost },
      { accountId: wip.id, credit: cost },
    ],
  });
  await syncProductTotals(tx, order.companyId, [material.productId]);
  return cost;
}

/** Start a draft: issue materials (the planned quantities unless others are given). */
export async function startOrder(companyId: string, id: string, userId: string, quantities?: Record<string, unknown>) {
  const order = await prisma.productionOrder.findFirst({ where: { id, companyId }, include: { materials: true } });
  if (!order) throw notFound('Production order not found');
  if (order.status !== 'draft') throw badRequest('Only draft orders can be started');
  if (!order.locationId) throw badRequest('This order has no location');

  const toIssue = order.materials.map((m) => ({
    material: m,
    quantity: quantities && quantities[m.id] !== undefined ? parseQuantity(quantities[m.id], 'Quantity') : m.plannedQuantity,
  }));
  if (!toIssue.some((t) => t.quantity > 0)) throw badRequest('Issue at least one material to start production');

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.productionOrder.updateMany({
      where: { id: order.id, status: 'draft' },
      data: { status: 'in_progress', startedAt: new Date() },
    });
    if (claimed.count === 0) throw badRequest('This order was already started');
    for (const t of toIssue) {
      if (t.quantity > 0) {
        const fresh = await tx.productionMaterial.findUnique({ where: { id: t.material.id } });
        await issueMaterial(tx, order, fresh, t.quantity, userId);
      }
    }
  });
}

/** Issue extra material to a running order (a material not on the order is added). */
export async function issueMore(companyId: string, id: string, userId: string, body: { productId?: unknown; quantity?: unknown }) {
  const quantity = parsePositiveQuantity(body.quantity);
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const product = await prisma.product.findFirst({ where: { id: productId, companyId } });
  if (!product) throw notFound('Material not found');
  return prisma.$transaction(async (tx) => {
    const order = await lockRunning(tx, companyId, id);
    if (product.id === order.productId) throw badRequest("A product can't be used to make itself");
    let material = order.materials.find((m: any) => m.productId === product.id);
    if (!material) material = await tx.productionMaterial.create({ data: { orderId: order.id, productId: product.id, plannedQuantity: 0 } });
    await issueMaterial(tx, order, material, quantity, userId);
  });
}

/** Return unused material from a running order to stock. */
export async function returnUnused(companyId: string, id: string, userId: string, body: { materialId?: unknown; quantity?: unknown }) {
  const quantity = parsePositiveQuantity(body.quantity);
  return prisma.$transaction(async (tx) => {
    const order = await lockRunning(tx, companyId, id);
    const material = order.materials.find((m: any) => m.id === body.materialId);
    if (!material) throw notFound('Material not found on this order');
    await returnMaterial(tx, order, material, quantity, userId, 'Unused material returned');
  });
}

/** Finish a running order: finished goods into stock at actual cost. */
export async function completeOrder(companyId: string, id: string, userId: string, body: { producedQuantity?: unknown; notes?: unknown }) {
  const produced = parseQuantity(body.producedQuantity, 'Quantity produced');
  return prisma.$transaction(async (tx) => {
    const order = await lockRunning(tx, companyId, id);
    const materialCost = round2(order.materialCost);
    const wip = await systemAccount(tx, companyId, 'inventory_wip');
    let unitCost = 0;

    if (produced > 0) {
      unitCost = materialCost / produced;
      await addStock(tx, {
        companyId,
        locationId: order.locationId,
        productId: order.productId,
        quantity: produced,
        unitCost,
        productionOrderId: order.id,
        sellingPriceSnapshot: order.product.price,
        type: 'production_output',
        reference: order.number,
        batchReference: order.number,
      });
      const finished = await inventoryAccountFor(tx, companyId, order.product.itemType);
      await postJournal(tx, {
        companyId,
        locationId: order.locationId,
        description: `${order.number}: ${produced} ${order.product.unit} ${order.product.name} produced`,
        sourceType: 'production_output',
        sourceId: order.id,
        reference: order.number,
        createdById: userId,
        lines: [
          { accountId: finished.id, debit: materialCost },
          { accountId: wip.id, credit: materialCost },
        ],
      });
      // Latest production cost becomes the product's reference cost.
      await tx.product.update({ where: { id: order.productId }, data: { cost: round2(unitCost) } });
      await syncProductTotals(tx, companyId, [order.productId]);
    } else if (materialCost > 0) {
      // Nothing usable came out: the material cost is a loss.
      const loss = await systemAccount(tx, companyId, 'inventory_loss');
      await postJournal(tx, {
        companyId,
        locationId: order.locationId,
        description: `${order.number}: production failed, materials written off`,
        sourceType: 'production_writeoff',
        sourceId: order.id,
        reference: order.number,
        createdById: userId,
        lines: [
          { accountId: loss.id, debit: materialCost },
          { accountId: wip.id, credit: materialCost },
        ],
      });
    }

    await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        producedQuantity: produced,
        unitCost,
        materialCost: 0, // nothing left in work in progress
        ...(typeof body.notes === 'string' && body.notes.trim() ? { notes: body.notes.trim() } : {}),
      },
    });
    return { produced, unitCost, totalCost: materialCost };
  });
}

/** Cancel: drafts just close; running orders return every issued material first. */
export async function cancelOrder(companyId: string, id: string, userId: string) {
  const order = await prisma.productionOrder.findFirst({ where: { id, companyId } });
  if (!order) throw notFound('Production order not found');
  if (order.status === 'completed') throw badRequest("Completed orders can't be cancelled");
  if (order.status === 'cancelled') throw badRequest('Already cancelled');
  return prisma.$transaction(async (tx) => {
    if (order.status === 'in_progress') {
      const running = await lockRunning(tx, companyId, id);
      for (const m of running.materials) {
        const fresh = await tx.productionMaterial.findUnique({ where: { id: m.id } });
        if (fresh && fresh.issuedQuantity > 0) {
          await returnMaterial(tx, running, fresh, fresh.issuedQuantity, userId, 'Production order cancelled');
        }
      }
    }
    const { count } = await tx.productionOrder.updateMany({
      where: { id, status: { in: ['draft', 'in_progress'] } },
      data: { status: 'cancelled', cancelledAt: new Date(), materialCost: 0 },
    });
    if (count === 0) throw new AppError(409, 'The order changed while cancelling. Please try again.');
  });
}

// =====================================================================
// Reading
// =====================================================================

export async function listOrders(companyId: string, where: Record<string, unknown> = {}) {
  const orders = await prisma.productionOrder.findMany({
    where: { companyId, ...where },
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { id: true, name: true, unit: true } },
      location: { select: { name: true } },
      customer: { select: { id: true, firstName: true, lastName: true } },
      deposits: { select: { amount: true, appliedAmount: true, refundedAmount: true } },
    },
  });
  return orders.map((o) => ({
    ...o,
    yieldPercent: o.status === 'completed' && o.plannedQuantity > 0 ? round2((o.producedQuantity / o.plannedQuantity) * 100) : null,
    totalCost: o.status === 'completed' ? round2(o.producedQuantity * o.unitCost) : round2(o.materialCost),
    depositsReceived: round2(o.deposits.reduce((s, d) => s + d.amount - d.refundedAmount, 0)),
  }));
}

export async function getOrder(companyId: string, id: string) {
  const order = await prisma.productionOrder.findFirst({
    where: { id, companyId },
    include: {
      product: { select: { id: true, name: true, sku: true, unit: true, price: true, itemType: true } },
      location: { select: { id: true, name: true } },
      customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      deposits: { orderBy: { receivedAt: 'asc' } },
      invoices: { select: { id: true, invoiceNumber: true, status: true, total: true, amountPaid: true, creditedAmount: true, finalizedAt: true }, orderBy: { createdAt: 'asc' } },
      materials: {
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true, itemType: true } },
          issues: {
            orderBy: { createdAt: 'asc' },
            include: {
              batch: {
                select: {
                  id: true, receivedAt: true, reference: true, unitCost: true,
                  supplier: { select: { name: true } },
                  purchase: { select: { id: true, reference: true } },
                  productionOrder: { select: { id: true, number: true } },
                },
              },
            },
          },
        },
      },
      outputBatches: { select: { id: true, quantityReceived: true, quantityRemaining: true, unitCost: true, receivedAt: true } },
    },
  });
  if (!order) throw notFound('Production order not found');

  // Totals for completed orders are kept on the order (materialCost resets
  // to zero when work in progress is cleared), so add them up from the lines.
  const totalMaterialCost = round2(order.materials.reduce((s, m) => s + m.issuedCost, 0));
  const ratio = order.plannedQuantity > 0 ? order.producedQuantity / order.plannedQuantity : 0;

  const materials = await Promise.all(
    order.materials.map(async (m) => {
      const available = order.locationId ? await stockAt(prisma, companyId, m.productId, order.locationId) : 0;
      // Standard usage for what was actually produced, from the plan's ratio.
      const standardForOutput = order.status === 'completed' ? roundQty(m.plannedQuantity * ratio) : null;
      const overUsage = standardForOutput === null ? null : roundQty(Math.max(0, m.issuedQuantity - standardForOutput));
      // Net quantity per batch (issues minus returns), for traceability.
      const byBatch = new Map<string, any>();
      for (const i of m.issues) {
        const cur = byBatch.get(i.batchId) || { batch: i.batch, quantity: 0, unitCost: i.unitCost };
        cur.quantity = roundQty(cur.quantity + i.quantity);
        byBatch.set(i.batchId, cur);
      }
      return {
        id: m.id,
        product: m.product,
        plannedQuantity: m.plannedQuantity,
        issuedQuantity: m.issuedQuantity,
        issuedCost: m.issuedCost,
        available,
        shortage: order.status === 'draft' ? roundQty(Math.max(0, m.plannedQuantity - available)) : 0,
        standardForOutput,
        overUsage,
        batches: Array.from(byBatch.values()).filter((b) => b.quantity > 0),
      };
    })
  );

  return {
    ...order,
    materials,
    totalMaterialCost,
    outputShortfall: order.status === 'completed' ? roundQty(Math.max(0, order.plannedQuantity - order.producedQuantity)) : null,
    yieldPercent: order.status === 'completed' && order.plannedQuantity > 0 ? round2(ratio * 100) : null,
    canStart: order.status === 'draft' && materials.every((m) => m.shortage === 0),
    // Customer order: agreed value, deposits taken, and what is left to collect.
    deposits: order.deposits.map(withAvailable),
    orderValue: order.unitPrice === null ? null : round2(order.unitPrice * (order.status === 'completed' ? order.producedQuantity : order.plannedQuantity)),
    depositsReceived: round2(order.deposits.reduce((s, d) => s + d.amount - d.refundedAmount, 0)),
    depositsUnused: round2(order.deposits.reduce((s, d) => s + depositAvailable(d), 0)),
  };
}

/** Production figures for a period (completed orders) plus what is running now. */
export async function productionSummary(companyId: string, from?: Date, to?: Date, locationIds?: string[]) {
  const loc = locationIds ? { locationId: { in: locationIds } } : {};
  const completed = await prisma.productionOrder.findMany({
    where: {
      companyId,
      status: 'completed',
      ...loc,
      ...(from || to ? { completedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    include: {
      product: { select: { id: true, name: true, unit: true } },
      materials: { include: { product: { select: { id: true, name: true, unit: true } } } },
    },
  });
  const [running, drafts] = await Promise.all([
    prisma.productionOrder.findMany({ where: { companyId, status: 'in_progress', ...loc }, select: { materialCost: true } }),
    prisma.productionOrder.count({ where: { companyId, status: 'draft', ...loc } }),
  ]);

  const byProduct = new Map<string, any>();
  const byMaterial = new Map<string, any>();
  let totalCost = 0;
  for (const o of completed) {
    const cost = o.materials.reduce((s, m) => s + m.issuedCost, 0);
    totalCost += cost;
    const p = byProduct.get(o.productId) || {
      productId: o.productId, name: o.product.name, unit: o.product.unit,
      orders: 0, planned: 0, produced: 0, cost: 0,
    };
    p.orders += 1;
    p.planned += o.plannedQuantity;
    p.produced += o.producedQuantity;
    p.cost += cost;
    byProduct.set(o.productId, p);
    const ratio = o.plannedQuantity > 0 ? o.producedQuantity / o.plannedQuantity : 0;
    for (const m of o.materials) {
      const x = byMaterial.get(m.productId) || {
        productId: m.productId, name: m.product.name, unit: m.product.unit, quantity: 0, cost: 0, overUsage: 0,
      };
      x.quantity += m.issuedQuantity;
      x.cost += m.issuedCost;
      x.overUsage += Math.max(0, m.issuedQuantity - m.plannedQuantity * ratio);
      byMaterial.set(m.productId, x);
    }
  }
  const products = Array.from(byProduct.values()).map((p) => ({
    ...p,
    planned: roundQty(p.planned),
    produced: roundQty(p.produced),
    shortfall: roundQty(Math.max(0, p.planned - p.produced)),
    cost: round2(p.cost),
    unitCost: p.produced > 0 ? round2(p.cost / p.produced) : 0,
    yieldPercent: p.planned > 0 ? round2((p.produced / p.planned) * 100) : 0,
  }));
  const materials = Array.from(byMaterial.values())
    .map((m) => ({ ...m, quantity: roundQty(m.quantity), cost: round2(m.cost), overUsage: roundQty(m.overUsage) }))
    .sort((a, b) => b.cost - a.cost);

  return {
    from: from ?? null,
    to: to ?? null,
    completedOrders: completed.length,
    inProgressOrders: running.length,
    draftOrders: drafts,
    wipValue: round2(running.reduce((s, o) => s + o.materialCost, 0)),
    totalCost: round2(totalCost),
    products,
    materials,
  };
}
