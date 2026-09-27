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

    const receipts = await prisma.stockMovement.findMany({
      where: { companyId, type: 'receipt' },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, sku: true } } },
      take: 100,
    });

    const totalPurchased = receipts.reduce((s: number, r: { quantity: number }) => s + Math.abs(r.quantity), 0);

    res.json({
      success: true,
      data: {
        supplier,
        summary: { totalPurchased, receiptCount: receipts.length },
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