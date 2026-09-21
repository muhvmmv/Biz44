import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService } from '../../services/crud.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
const supplierService = new CrudService('supplier');

router.use(authenticate);

// ---------- SUPPLIER SUMMARY (must be ABOVE /:id) ----------
router.get('/:id/summary', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!supplier) return res.status(404).json({ success: false, message: 'Not found' });

    // For now, use all 'receipt' stock movements (until supplier-per-movement is tracked)
    const receipts = await prisma.stockMovement.findMany({
      where: { companyId, type: 'receipt' },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, sku: true } } },
      take: 100,
    });

    const totalPurchased = receipts.reduce((s, r) => s + Math.abs(r.quantity), 0);

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

// ---------- LIST ----------
router.get('/', async (req, res, next) => {
  try {
    const suppliers = await supplierService.findMany({ companyId: req.user?.companyId });
    res.json({ success: true, data: suppliers });
  } catch (err) { next(err); }
});

// ---------- CREATE ----------
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId;
    const supplier = await supplierService.create({ ...req.body, companyId });
    res.status(201).json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

// ---------- GET ONE ----------
router.get('/:id', async (req, res, next) => {
  try {
    const supplier = await supplierService.findById(req.params.id);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

// ---------- UPDATE ----------
router.put('/:id', async (req, res, next) => {
  try {
    const supplier = await supplierService.update(req.params.id, req.body);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

// ---------- DELETE ----------
router.delete('/:id', async (req, res, next) => {
  try {
    await supplierService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;