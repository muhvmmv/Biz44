import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere } from '../../middleware/locationAuth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

async function findOrCreateAccount(
  tx: any,
  companyId: string,
  name: string,
  type: string
) {
  const existing = await tx.account.findFirst({ where: { companyId, name } });
  if (existing) return existing;
  return tx.account.create({ data: { companyId, name, type, balance: 0 } });
}

function computeStatus(
  total: number,
  amountPaid: number,
  dueDate: Date | null
): string {
  if (amountPaid >= total - 0.01) return 'paid';
  if (amountPaid > 0) {
    if (dueDate && new Date() > dueDate) return 'overdue';
    return 'partially_paid';
  }
  if (dueDate && new Date() > dueDate) return 'overdue';
  return 'unpaid';
}

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
      const balance = p.total - p.amountPaid;
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
          select: { id: true, quantityReceived: true, unitCost: true },
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
    const { amount, method = 'cash', account = 'Cash', reference, notes } = req.body as {
      amount: number;
      method?: string;
      account?: string;
      reference?: string;
      notes?: string;
    };

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }

    const purchase = await prisma.purchase.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const balance = purchase.total - purchase.amountPaid;
    if (balance <= 0.01) {
      return res.status(400).json({ success: false, message: 'This purchase is already fully paid' });
    }

    const payAmount = Math.min(Number(amount), balance);
    const newPaid = purchase.amountPaid + payAmount;
    const newStatus = computeStatus(purchase.total, newPaid, purchase.dueDate);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Record the payment
      const payment = await tx.purchasePayment.create({
        data: {
          companyId,
          locationId: purchase.locationId,
          purchaseId: purchase.id,
          amount: payAmount,
          method,
          account,
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
      const cashAccount = await findOrCreateAccount(tx, companyId, account, 'asset');

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
        outstanding: purchase.total - newPaid,
        status: newStatus,
      },
    });
  } catch (err) { next(err); }
});

export default router;