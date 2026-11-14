import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, guardRecordLocation } from '../../middleware/locationAuth';

import { prisma } from '../../lib/prisma';
import { findOrCreateAccount, resolvePaymentAccount, parsePositiveAmount } from '../../lib/accounts';
import { purchaseBalance, purchaseStatus, returnToSupplier } from './purchase.service';
const router = Router();

router.use(authenticate);

// Every /:id route: the purchase must belong to this company and to a
// location the user can access.
router.param(
  'id',
  guardRecordLocation((id, companyId) =>
    prisma.purchase.findFirst({ where: { id, companyId }, select: { locationId: true } })
  )
);


// ---------- LIST ----------
// Query params: status (paid|unpaid|partially_paid|overdue|all), supplierId, from, to
router.get('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, supplierId, from, to } = req.query;
    const where: any = {
      companyId: req.user?.companyId,
      ...locationWhere(req),
    };

    if (supplierId) where.supplierId = supplierId;
    if (status && status !== 'all') where.status = status;

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(String(from));
      if (to) where.date.lte = new Date(String(to));
    }

    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true } },
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
        },
      },
    });

    res.json({ success: true, data: purchases });
  } catch (err) { next(err); }
});

// ---------- SUMMARY (dashboard) ----------
router.get('/summary', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const purchases = await prisma.purchase.findMany({
      where: { companyId, ...locationWhere(req) },
      select: {
        id: true,
        total: true,
        amountPaid: true,
        returnedAmount: true,
        status: true,
        dueDate: true,
      },
    });

    const now = new Date();
    let outstanding = 0;
    let unpaidCount = 0;
    let overdueAmount = 0;
    let overdueCount = 0;

    for (const p of purchases) {
      const balance = purchaseBalance(p);
      if (balance > 0.01) {
        outstanding += balance;
        unpaidCount += 1;
        if (p.dueDate && new Date(p.dueDate) < now) {
          overdueAmount += balance;
          overdueCount += 1;
        }
      }
    }

    res.json({
      success: true,
      data: {
        outstanding,
        unpaidCount,
        overdueAmount,
        overdueCount,
        totalPurchases: purchases.length,
      },
    });
  } catch (err) { next(err); }
});

// ---------- GET ONE ----------
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const purchase = await prisma.purchase.findFirst({
      where: { id: req.params.id, companyId: req.user?.companyId },
      include: {
        supplier: true,
        items: {
          include: {
            product: { select: { name: true, sku: true } },
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
        },
        batches: {
          select: {
            id: true,
            productId: true,
            quantityReceived: true,
            quantityRemaining: true,
            unitCost: true,
            product: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    res.json({ success: true, data: purchase });
  } catch (err) { next(err); }
});

// ---------- RECORD PAYMENT ----------
router.post('/:id/pay', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const { method = 'cash', reference, notes } = req.body as {
      method?: string;
      reference?: string;
      notes?: string;
    };
    const amount = parsePositiveAmount(req.body?.amount);

    const purchase = await prisma.purchase.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const balance = purchaseBalance(purchase);
    if (balance <= 0.01) {
      return res.status(400).json({ success: false, message: 'This purchase is already fully paid' });
    }

    if (amount > balance + 0.01) {
      return res.status(400).json({
        success: false,
        message: `Amount is more than the balance owed (${balance.toFixed(2)})`,
      });
    }
    const payAmount = Math.min(amount, balance);

    // Validate the paying account before writing anything.
    const payFromAccount = await resolvePaymentAccount(prisma, companyId, {
      accountId: req.body?.accountId,
      account: req.body?.account,
    });
    const newPaid = purchase.amountPaid + payAmount;
    const newStatus = purchaseStatus({ ...purchase, amountPaid: newPaid });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Record the payment
      const payment = await tx.purchasePayment.create({
        data: {
          companyId,
          locationId: purchase.locationId,
          purchaseId: purchase.id,
          amount: payAmount,
          method,
          account: payFromAccount.name,
          reference,
          notes,
        },
      });

      // 2. Update purchase totals + status
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { amountPaid: newPaid, status: newStatus },
      });

      // 3. Accounting: AP down, Cash down
      const apAccount = await findOrCreateAccount(tx, companyId, 'Accounts Payable', 'liability');
      const cashAccount = payFromAccount;

      await tx.transaction.create({
        data: {
          companyId,
          locationId: purchase.locationId,
          accountId: apAccount.id,
          type: 'payment',
          description: `Supplier payment${purchase.reference ? ` ${purchase.reference}` : ''}`,
          amount: -payAmount,
          date: new Date(),
        },
      });
      await tx.account.update({
        where: { id: apAccount.id },
        data: { balance: { decrement: payAmount } },
      });

      await tx.transaction.create({
        data: {
          companyId,
          locationId: purchase.locationId,
          accountId: cashAccount.id,
          type: 'payment',
          description: `Supplier payment${purchase.reference ? ` ${purchase.reference}` : ''}`,
          amount: payAmount,
          date: new Date(),
        },
      });
      await tx.account.update({
        where: { id: cashAccount.id },
        data: { balance: { decrement: payAmount } },
      });

      return payment;
    });

    res.json({
      success: true,
      data: {
        payment: result,
        amountPaid: newPaid,
        outstanding: purchaseBalance({ ...purchase, amountPaid: newPaid }),
        status: newStatus,
      },
    });
  } catch (err) { next(err); }
});

// ---------- RETURN GOODS TO SUPPLIER ----------
// body: { batchId, quantity, refundAccountId?, reference?, notes? }
router.post('/:id/return', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batchId, quantity, refundAccountId, reference, notes } = req.body || {};
    if (!batchId) return res.status(400).json({ success: false, message: 'Choose which delivery line to return' });
    const result = await returnToSupplier({
      companyId: req.user!.companyId,
      purchaseId: req.params.id,
      batchId,
      quantity,
      refundAccountId,
      reference,
      notes,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;