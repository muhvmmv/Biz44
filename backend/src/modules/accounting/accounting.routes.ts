import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere } from '../../middleware/locationAuth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

async function findOrCreateAccount(companyId: string, name: string, type: string) {
  const existing = await prisma.account.findFirst({ where: { companyId, name } });
  if (existing) return existing;
  return prisma.account.create({ data: { companyId, name, type, balance: 0 } });
}

function targetLocationId(req: Request): string {
  return req.locationId || req.allowedLocationIds[0];
}

// ---------- ACCOUNTS (business-level) ----------
router.get('/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;

    const defaults = [
      { name: 'Cash', type: 'asset' },
      { name: 'Bank Account', type: 'asset' },
      { name: 'Accounts Receivable', type: 'asset' },
      { name: 'Inventory', type: 'asset' },
      { name: 'Accounts Payable', type: 'liability' },
      { name: 'Sales Revenue', type: 'revenue' },
      { name: 'Cost of Goods Sold', type: 'expense' },
      { name: 'Operating Expenses', type: 'expense' },
      { name: 'Inventory Loss', type: 'expense' },
      { name: 'Rent Expense', type: 'expense' },
      { name: 'Utilities Expense', type: 'expense' },
      { name: 'Salary Expense', type: 'expense' },
      { name: 'General Expense', type: 'expense' },
    ];
    for (const d of defaults) await findOrCreateAccount(companyId, d.name, d.type);

    const accounts = await prisma.account.findMany({
      where: { companyId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
});

// ---------- TRANSACTIONS (location-scoped) ----------
router.get('/transactions', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, from, to } = req.query;
    const where: any = { companyId: req.user?.companyId, ...locationWhere(req) };
    if (type) where.type = type;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(String(from));
      if (to) where.date.lte = new Date(String(to));
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 500,
      include: { account: { select: { name: true, type: true } } },
    });
    res.json({ success: true, data: transactions });
  } catch (err) { next(err); }
});

// ---------- EXPENSES (location-scoped) ----------
router.get('/expenses', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expenses = await prisma.transaction.findMany({
      where: { companyId: req.user?.companyId, type: 'expense', ...locationWhere(req) },
      orderBy: { date: 'desc' },
      include: { account: { select: { name: true } } },
    });
    res.json({ success: true, data: expenses });
  } catch (err) { next(err); }
});

router.post('/expenses', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const { category, amount, description, date } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const account = await findOrCreateAccount(companyId, category || 'General Expense', 'expense');
    const cash = await findOrCreateAccount(companyId, 'Cash', 'asset');
    const locationId = targetLocationId(req);

    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.transaction.create({
        data: {
          companyId,
          locationId,
          accountId: account.id,
          type: 'expense',
          description: description || category,
          amount: Number(amount),
          date: date ? new Date(date) : new Date(),
        },
      });

      await tx.account.update({
        where: { id: account.id },
        data: { balance: { increment: Number(amount) } },
      });
      await tx.account.update({
        where: { id: cash.id },
        data: { balance: { decrement: Number(amount) } },
      });

      return expense;
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ---------- RECEIVABLE (location-scoped) ----------
router.get('/receivable', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['unpaid', 'partially_paid', 'overdue'] },
        ...locationWhere(req),
      },
      include: { customer: { select: { firstName: true, lastName: true } } },
    });

    const now = new Date();
    const buckets = { current: 0, days30: 0, days60: 0, days90: 0 };
    let total = 0;

    const rows = invoices.map((inv) => {
      const balance = inv.total - inv.amountPaid;
      total += balance;
      const due = inv.dueDate ? new Date(inv.dueDate) : now;
      const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

      let bucket = 'current';
      if (diffDays > 60) { bucket = 'days90'; buckets.days90 += balance; }
      else if (diffDays > 30) { bucket = 'days60'; buckets.days60 += balance; }
      else if (diffDays > 0) { bucket = 'days30'; buckets.days30 += balance; }
      else { buckets.current += balance; }

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customer: inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}` : '—',
        dueDate: inv.dueDate,
        total: inv.total,
        amountPaid: inv.amountPaid,
        balance,
        daysOverdue: diffDays > 0 ? diffDays : 0,
        bucket,
      };
    });

    res.json({ success: true, data: { summary: { total, ...buckets }, rows } });
  } catch (err) { next(err); }
});

// ---------- PROFIT & LOSS (location-scoped) ----------
router.get('/profit-loss', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const { from, to } = req.query;

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(String(from));
    if (to) dateFilter.lte = new Date(String(to));

    const where: any = { companyId, ...locationWhere(req) };
    if (from || to) where.date = dateFilter;

    // Revenue from sale transactions
    const revenueAgg = await prisma.transaction.aggregate({
      where: { ...where, type: 'sale' },
      _sum: { amount: true },
    });
    const revenue = revenueAgg._sum.amount || 0;

    // COGS
    const cogsAgg = await prisma.transaction.aggregate({
      where: { ...where, type: 'cogs' },
      _sum: { amount: true },
    });
    const cogs = cogsAgg._sum.amount || 0;

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    // Operating expenses by account
    const opexByAccount = await prisma.transaction.groupBy({
      by: ['accountId'],
      where: { ...where, type: 'expense' },
      _sum: { amount: true },
    });

    const accounts = await prisma.account.findMany({ where: { companyId } });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const expenseBreakdown = opexByAccount.map((e) => ({
      account: accountMap.get(e.accountId)?.name || 'Unknown',
      amount: e._sum.amount || 0,
    }));

    const totalOpex = expenseBreakdown.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - totalOpex;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    res.json({
      success: true,
      data: {
        revenue,
        cogs,
        grossProfit,
        grossMargin,
        totalOpex,
        totalExpenses: totalOpex,
        netProfit,
        netMargin,
        margin: netMargin,
        expenseBreakdown,
      },
    });
  } catch (err) { next(err); }
});

export default router;