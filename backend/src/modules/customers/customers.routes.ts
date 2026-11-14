import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService, pick } from '../../services/crud.service';
import { badRequest } from '../../lib/errors';

import { prisma } from '../../lib/prisma';
const router = Router();
const customerService = new CrudService('customer');

router.use(authenticate);

// Summary (must come BEFORE /:id)
router.get('/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
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
      .reduce((s: number, i) => s + i.total, 0);
    const totalPaid = invoices.reduce((s: number, i) => s + i.amountPaid, 0);
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

const WRITABLE = ['firstName', 'lastName', 'email', 'phone', 'address'] as const;

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await customerService.findMany(req.user!.companyId, { orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = pick(req.body, WRITABLE);
    if (!data.firstName || !data.lastName) throw badRequest('firstName and lastName required');
    const row = await customerService.create(req.user!.companyId, data);
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await customerService.findOne(req.params.id, req.user!.companyId);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await customerService.update(req.params.id, req.user!.companyId, pick(req.body, WRITABLE));
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await customerService.delete(req.params.id, req.user!.companyId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
