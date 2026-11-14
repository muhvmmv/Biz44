import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService } from '../../services/crud.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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
    const outstanding = totalPurchased - totalPaid;

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

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const suppliers = await supplierService.findMany({ companyId: req.user?.companyId });
    res.json({ success: true, data: suppliers });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId;
    const supplier = await supplierService.create({ ...req.body, companyId });
    res.status(201).json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = await supplierService.findById(req.params.id);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = await supplierService.update(req.params.id, req.body);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supplierService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;