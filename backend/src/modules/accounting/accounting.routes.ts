import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// Helper: find or create an account by name for a company
async function findOrCreateAccount(companyId: string, name: string, type: string) {
  const existing = await prisma.account.findFirst({ where: { companyId, name } });
  if (existing) return existing;
  return prisma.account.create({ data: { companyId, name, type, balance: 0 } });
}

// ---------- ACCOUNTS ----------
router.get('/accounts', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;

    // Ensure standard accounts exist
    const defaults = [
      { name: 'Cash', type: 'asset' },
      { name: 'Bank Account', type: 'asset' },
      { name: 'Accounts Receivable', type: 'asset' },
      { name: 'Inventory', type: 'asset' },
      { name: 'Accounts Payable', type: 'liability' },
      { name: 'Sales Revenue', type: 'revenue' },
      { name: 'Cost of Goods Sold', type: 'expense' },
      { name: 'Rent Expense', type: 'expense' },
      { name: 'Utilities Expense', type: 'expense' },
      { name: 'Salary Expense', type: 'expense' },
      { name: 'General Expense', type: 'expense' },
    ];
    for (const d of defaults) {
      await findOrCreateAccount(companyId, d.name, d.type);
    }

    const accounts = await prisma.account.findMany({
      where: { companyId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
});

// ---------- TRANSACTIONS ----------
router.get('/transactions', async (req, res, next) => {
  try {
    const { type, from, to } = req.query;
    const where: any = { companyId: req.user?.companyId };
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

// ---------- EXPENSES ----------
// List expenses (transactions of type expense)
router.get('/expenses', async (req, res, next) => {
  try {
    const expenses = await prisma.transaction.findMany({
      where: { companyId: req.user?.companyId, type: 'expense' },
      orderBy: { date: 'desc' },
      include: { account: { select: { name: true } } },
    });
    res.json({ success: true, data: expenses });
  } catch (err) { next(err); }
});

// Record an expense
router.post('/expenses', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const { category, amount, description, paymentMethod = 'cash', date } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const account = await findOrCreateAccount(companyId, category || 'General Expense', 'expense');
    const cash = await findOrCreateAccount(companyId, 'Cash', 'asset');

    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.transaction.create({
        data: {
          companyId,
          accountId: account.id,
          type: 'expense',
          description: description || category,
          amount: Number(amount),
          date: date ? new Date(date) : new Date(),
        },
      });

      // Update account balances
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

// ---------- ACCOUNTS RECEIVABLE (AGING) ----------
router.get('/receivable', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['unpaid', 'partially_paid', 'overdue'] },
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
      if (diffDays > 60) {
        bucket = 'days90';
        buckets.days90 += balance;
      } else if (diffDays > 30) {
        bucket = 'days60';
        buckets.days60 += balance;
      } else if (diffDays > 0) {
        bucket = 'days30';
        buckets.days30 += balance;
      } else {
        buckets.current += balance;
      }

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customer: inv.customer
          ? `${inv.customer.firstName} ${inv.customer.lastName}`
          : '—',
        dueDate: inv.dueDate,
        total: inv.total,
        amountPaid: inv.amountPaid,
        balance,
        daysOverdue: diffDays > 0 ? diffDays : 0,
        bucket,
      };
    });

    res.json({
      success: true,
      data: {
        summary: { total, ...buckets },
        rows,
      },
    });
  } catch (err) { next(err); }
});

// ---------- PROFIT & LOSS ----------
router.get('/profit-loss', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const { from, to } = req.query;

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(String(from));
    if (to) dateFilter.lte = new Date(String(to));

    const where: any = { companyId };
    if (from || to) where.date = dateFilter;

    // Revenue: sum of payments received (simplified — or invoice totals finalized)
    const payments = await prisma.payment.aggregate({
      where: { companyId, ...(from || to ? { paidAt: dateFilter } : {}) },
      _sum: { amount: true },
    });
    const revenue = payments._sum.amount || 0;

    // Expenses
    const expensesByAccount = await prisma.transaction.groupBy({
      by: ['accountId'],
      where: { ...where, type: 'expense' },
      _sum: { amount: true },
    });

    const accounts = await prisma.account.findMany({ where: { companyId } });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const expenseBreakdown = expensesByAccount.map((e) => ({
      account: accountMap.get(e.accountId)?.name || 'Unknown',
      amount: e._sum.amount || 0,
    }));

    const totalExpenses = expenseBreakdown.reduce((s, e) => s + e.amount, 0);
    const netProfit = revenue - totalExpenses;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    res.json({
      success: true,
      data: {
        revenue,
        totalExpenses,
        netProfit,
        margin,
        expenseBreakdown,
      },
    });
  } catch (err) { next(err); }
});

export default router;