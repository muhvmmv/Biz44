import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService, pick } from '../../services/crud.service';
import { badRequest } from '../../lib/errors';

import { prisma } from '../../lib/prisma';
import { purchaseBalance } from '../purchases/purchase.service';
const router = Router();
const supplierService = new CrudService('supplier');

router.use(authenticate);

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
    const rows = await supplierService.findMany(req.user!.companyId, { orderBy: { name: 'asc' } });
    res.json({ success: true, data: rows });
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
    await supplierService.delete(req.params.id, req.user!.companyId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
