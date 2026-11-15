import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService, pick } from '../../services/crud.service';
import { badRequest } from '../../lib/errors';

import { prisma } from '../../lib/prisma';
import { supplierStatement } from '../../lib/statements';
import { purchaseBalance } from '../purchases/purchase.service';
const router = Router();
const supplierService = new CrudService('supplier');

router.use(authenticate);

/** Parse an optional date; a plain YYYY-MM-DD `to` means the end of that day. */
function statementDate(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw badRequest(`Invalid date: ${value}`);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) d.setHours(23, 59, 59, 999);
  return d;
}

// Statement: running balance for a period, aging and open documents.
router.get('/:id/statement', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await supplierStatement(
      req.user!.companyId, req.params.id,
      statementDate(req.query.from), statementDate(req.query.to, true)
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// Summary (must come BEFORE /:id)
router.get('/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!supplier) return res.status(404).json({ success: false, message: 'Not found' });

    const purchases = await prisma.purchase.findMany({
      where: { companyId, supplierId: supplier.id },
      orderBy: { date: 'desc' },
      include: {
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
    });

    const totalPurchased = purchases.reduce((s, p) => s + p.total, 0);
    const totalPaid = purchases.reduce((s, p) => s + p.amountPaid, 0);
    const totalReturned = purchases.reduce((s, p) => s + (p.returnedAmount ?? 0), 0);
    const outstanding = purchases.reduce((s, p) => s + Math.max(0, purchaseBalance(p)), 0);

    const receipts = purchases.flatMap((p) =>
      p.items.map((it) => ({
        id: it.id,
        quantity: it.quantity,
        unitCost: it.unitCost,
        total: it.total,
        reference: p.reference,
        createdAt: p.date,
        product: it.product,
      }))
    );

    res.json({
      success: true,
      data: {
        supplier,
        summary: {
          totalPurchased,
          totalPaid,
          totalReturned,
          outstanding,
          purchaseCount: purchases.length,
          totalUnits: receipts.reduce((s, r) => s + r.quantity, 0),
        },
        purchases,
        receipts,
      },
    });
  } catch (err) { next(err); }
});

const WRITABLE = ['name', 'email', 'phone', 'address'] as const;

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const [rows, purchases] = await Promise.all([
      supplierService.findMany(companyId, { orderBy: { name: 'asc' } }),
      prisma.purchase.findMany({
        where: { companyId, supplierId: { not: null } },
        select: { supplierId: true, total: true, amountPaid: true, returnedAmount: true, dueDate: true },
      }),
    ]);
    // What is owed to each supplier, and how much of it is past due.
    const now = new Date();
    const owed = new Map<string, { owed: number; overdue: number }>();
    for (const p of purchases) {
      const balance = purchaseBalance(p);
      if (balance <= 0.009) continue;
      const o = owed.get(p.supplierId!) ?? { owed: 0, overdue: 0 };
      o.owed += balance;
      if (p.dueDate && p.dueDate < now) o.overdue += balance;
      owed.set(p.supplierId!, o);
    }
    const data = (rows as any[]).map((r) => ({
      ...r,
      owed: Math.round((owed.get(r.id)?.owed ?? 0) * 100) / 100,
      overdue: Math.round((owed.get(r.id)?.overdue ?? 0) * 100) / 100,
    }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = pick(req.body, WRITABLE);
    if (!data.name) throw badRequest('name required');
    const row = await supplierService.create(req.user!.companyId, data);
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await supplierService.findOne(req.params.id, req.user!.companyId);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await supplierService.update(req.params.id, req.user!.companyId, pick(req.body, WRITABLE));
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const used = await prisma.purchase.count({ where: { supplierId: req.params.id, companyId: req.user!.companyId } })
      + await prisma.inventoryBatch.count({ where: { supplierId: req.params.id, companyId: req.user!.companyId } });
    if (used > 0) throw badRequest('This supplier has deliveries on record, so it cannot be deleted. Its history is kept.');
    await supplierService.delete(req.params.id, req.user!.companyId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
