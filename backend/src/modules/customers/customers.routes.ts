import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService } from '../../services/crud.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
const customerService = new CrudService('customer');

router.use(authenticate);

// ---------- CUSTOMER SUMMARY (must be ABOVE /:id) ----------
router.get('/:id/summary', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!customer) return res.status(404).json({ success: false, message: 'Not found' });

    const invoices = await prisma.invoice.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      include: { payments: true },
    });

    const totalSales = invoices
      .filter((i) => i.status !== 'draft' && i.status !== 'cancelled')
      .reduce((s, i) => s + i.total, 0);
    const totalPaid = invoices.reduce((s, i) => s + i.amountPaid, 0);
    const outstanding = totalSales - totalPaid;

    const payments = invoices
      .flatMap((i) =>
        i.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          method: p.method,
          paidAt: p.paidAt,
          reference: p.reference,
          invoiceNumber: i.invoiceNumber,
        }))
      )
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

    res.json({
      success: true,
      data: {
        customer,
        summary: { totalSales, totalPaid, outstanding, invoiceCount: invoices.length },
        invoices,
        payments,
      },
    });
  } catch (err) { next(err); }
});

// ---------- LIST ----------
router.get('/', async (req, res, next) => {
  try {
    const customers = await customerService.findMany({ companyId: req.user?.companyId });
    res.json({ success: true, data: customers });
  } catch (err) { next(err); }
});

// ---------- CREATE ----------
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId;
    const customer = await customerService.create({ ...req.body, companyId });
    res.status(201).json({ success: true, data: customer });
  } catch (err) { next(err); }
});

// ---------- GET ONE ----------
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await customerService.findById(req.params.id);
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
});

// ---------- UPDATE ----------
router.put('/:id', async (req, res, next) => {
  try {
    const customer = await customerService.update(req.params.id, req.body);
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
});

// ---------- DELETE ----------
router.delete('/:id', async (req, res, next) => {
  try {
    await customerService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;