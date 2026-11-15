import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation } from '../../middleware/locationAuth';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { parsePositiveQuantity, roundQty } from '../../lib/accounts';
import { addStock, consumeFifo, syncProductTotals } from '../../lib/inventory';
import { round2 } from '../../lib/ledger';

/**
 * Stock transfers between locations. Stock leaves the source oldest batch
 * first and arrives at the destination as batches with the same cost,
 * received date and source (supplier delivery or production order), so the
 * company's stock value — and the ledger — do not change.
 */
const router = Router();
router.use(authenticate);

const include = {
  fromLocation: { select: { id: true, name: true } },
  toLocation: { select: { id: true, name: true } },
  lines: { include: { product: { select: { id: true, name: true, unit: true, itemType: true } } } },
};

async function nextNumber(companyId: string) {
  const last = await prisma.stockTransfer.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { number: true } });
  const n = last ? parseInt(last.number.replace(/\D/g, ''), 10) || 0 : 0;
  return `TR-${String(n + 1).padStart(4, '0')}`;
}

router.get('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allowed = req.allowedLocationIds;
    const transfers = await prisma.stockTransfer.findMany({
      where: {
        companyId: req.user!.companyId,
        OR: [{ fromLocationId: { in: allowed } }, { toLocationId: { in: allowed } }],
      },
      include,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json({
      success: true,
      data: transfers.map((t) => ({ ...t, totalCost: round2(t.lines.reduce((s, l) => s + l.totalCost, 0)) })),
    });
  } catch (err) { next(err); }
});

router.get('/:id', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.stockTransfer.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId }, include });
    if (!t || (!req.allowedLocationIds.includes(t.fromLocationId) && !req.allowedLocationIds.includes(t.toLocationId))) {
      throw notFound('Transfer not found');
    }
    res.json({ success: true, data: { ...t, totalCost: round2(t.lines.reduce((s, l) => s + l.totalCost, 0)) } });
  } catch (err) { next(err); }
});

router.post('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const fromLocationId = String(req.body?.fromLocationId ?? '');
    const toLocationId = String(req.body?.toLocationId ?? '');
    if (!fromLocationId || !toLocationId) throw badRequest('Choose where the stock comes from and where it goes');
    if (fromLocationId === toLocationId) throw badRequest('Choose two different locations');
    const locations = await prisma.location.findMany({ where: { companyId, id: { in: [fromLocationId, toLocationId] }, status: 'active' } });
    if (locations.length !== 2) throw notFound('Location not found');
    if (!req.allowedLocationIds.includes(fromLocationId) || !req.allowedLocationIds.includes(toLocationId)) {
      throw new AppError(403, 'You need access to both locations to move stock between them');
    }

    const raw = Array.isArray(req.body?.items) ? req.body.items : [];
    if (raw.length === 0) throw badRequest('Add at least one item to move');
    // One line per product (quantities for a repeated product are added up).
    const byProduct = new Map<string, number>();
    raw.forEach((it: any, i: number) => {
      const productId = String(it?.productId ?? '');
      if (!productId) throw badRequest(`Line ${i + 1}: choose an item`);
      byProduct.set(productId, roundQty((byProduct.get(productId) ?? 0) + parsePositiveQuantity(it?.quantity, `Line ${i + 1} quantity`)));
    });
    const products = await prisma.product.findMany({ where: { companyId, id: { in: Array.from(byProduct.keys()) } } });
    if (products.length !== byProduct.size) throw notFound('One or more items were not found');
    const notes = typeof req.body?.notes === 'string' && req.body.notes.trim() ? req.body.notes.trim().slice(0, 500) : null;

    const transfer = await prisma.$transaction(async (tx) => {
      // A failed number clash rolls back the whole transfer, so retry from the top.
      const number = await nextNumber(companyId);
      const created = await tx.stockTransfer.create({
        data: { companyId, number, fromLocationId, toLocationId, notes, createdById: req.user!.id },
      });
      for (const product of products) {
        const quantity = byProduct.get(product.id)!;
        const out = await consumeFifo(tx, {
          companyId, locationId: fromLocationId, productId: product.id, productName: product.name, unit: product.unit,
          quantity, type: 'transfer_out', reference: number, notes: `To ${locations.find((l) => l.id === toLocationId)!.name}`,
        });
        // Recreate each batch piece at the destination with its cost and history.
        const sources = await tx.inventoryBatch.findMany({ where: { id: { in: out.lines.map((l) => l.batchId) } } });
        for (const line of out.lines) {
          const src = sources.find((b) => b.id === line.batchId)!;
          await addStock(tx, {
            companyId, locationId: toLocationId, productId: product.id, quantity: line.quantity, unitCost: line.unitCost,
            supplierId: src.supplierId, purchaseId: src.purchaseId, productionOrderId: src.productionOrderId,
            sellingPriceSnapshot: src.sellingPriceSnapshot, batchReference: src.reference ?? number, receivedAt: src.receivedAt,
            type: 'transfer_in', reference: number, notes: `From ${locations.find((l) => l.id === fromLocationId)!.name}`,
          });
        }
        await tx.stockTransferLine.create({ data: { transferId: created.id, productId: product.id, quantity, totalCost: out.totalCost } });
      }
      await syncProductTotals(tx, companyId, products.map((p) => p.id));
      return tx.stockTransfer.findUnique({ where: { id: created.id }, include });
    });
    res.status(201).json({ success: true, data: { ...transfer, totalCost: round2(transfer!.lines.reduce((s, l) => s + l.totalCost, 0)) } });
  } catch (err: any) {
    if (err?.code === 'P2002') return next(new AppError(409, 'Another transfer was saved at the same moment. Please try again.'));
    next(err);
  }
});

export default router;
