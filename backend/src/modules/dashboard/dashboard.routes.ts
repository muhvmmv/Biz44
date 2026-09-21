import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// GET /api/dashboard/summary
router.get('/summary', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // All finalized invoices
    const invoices = await prisma.invoice.findMany({
      where: { companyId, status: { not: 'draft' } },
      include: { items: { include: { product: { select: { name: true } } } } },
    });

    const paidInvoices = invoices.filter((i) => i.status === 'paid' || i.status === 'partially_paid');
    const unpaidInvoices = invoices.filter((i) => ['unpaid', 'overdue', 'partially_paid'].includes(i.status));
    const overdueInvoices = unpaidInvoices.filter((i) => i.dueDate && new Date(i.dueDate) < now);
    const dueTodayInvoices = unpaidInvoices.filter(
      (i) => i.dueDate && new Date(i.dueDate).toDateString() === now.toDateString()
    );

    const totalRevenue = paidInvoices.reduce((s, i) => s + i.total, 0);
    const outstanding = unpaidInvoices.reduce((s, i) => s + (i.total - i.amountPaid), 0);

    // This month vs last month revenue
    const thisMonthRevenue = invoices
      .filter((i) => i.finalizedAt && i.finalizedAt >= thisMonthStart)
      .reduce((s, i) => s + i.total, 0);
    const lastMonthRevenue = invoices
      .filter((i) => i.finalizedAt && i.finalizedAt >= lastMonthStart && i.finalizedAt < thisMonthStart)
      .reduce((s, i) => s + i.total, 0);
    const revenueChange = lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : (thisMonthRevenue > 0 ? 100 : 0);

    // Expenses
    const expensesAgg = await prisma.transaction.aggregate({
      where: { companyId, type: 'expense' },
      _sum: { amount: true },
    });
    const totalExpenses = expensesAgg._sum.amount || 0;
    const profit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    // Cash flow
    const paymentsAgg = await prisma.payment.aggregate({
      where: { companyId },
      _sum: { amount: true },
    });
    const cashIn = paymentsAgg._sum.amount || 0;
    const netCash = cashIn - totalExpenses;

    // Inventory
    const products = await prisma.product.findMany({
      where: { companyId },
      select: { quantity: true, reorderPoint: true, price: true, cost: true },
    });
    const totalUnits = products.reduce((s, p) => s + p.quantity, 0);
    const inventoryValue = products.reduce((s, p) => s + p.quantity * p.price, 0);
    const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= p.reorderPoint).length;
    const outOfStock = products.filter((p) => p.quantity === 0).length;

    // Sales by product (for pie chart)
    const productSales: Record<string, number> = {};
    for (const inv of invoices) {
      for (const item of inv.items) {
        const name = item.product?.name || item.description;
        productSales[name] = (productSales[name] || 0) + item.total;
      }
    }
    const topProducts = Object.entries(productSales)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        revenue: totalRevenue,
        revenueChange,
        profit,
        profitMargin,
        expenses: totalExpenses,
        netCash,
        outstanding,
        overdueCount: overdueInvoices.length,
        unpaidCount: unpaidInvoices.length,
        totalUnits,
        inventoryValue,
        lowStock,
        outOfStock,
        dueToday: dueTodayInvoices.length,
        expectedToday: dueTodayInvoices.reduce((s, i) => s + (i.total - i.amountPaid), 0),
        topProducts,
      },
    });
  } catch (err) { next(err); }
});

router.get('/monthly-chart', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const months = Math.min(Math.max(parseInt(String(req.query.months || '6')), 1), 12);

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const invoices = await prisma.invoice.findMany({
      where: { companyId, finalizedAt: { gte: start }, status: { not: 'cancelled' } },
      select: { total: true, finalizedAt: true },
    });

    const expenses = await prisma.transaction.findMany({
      where: { companyId, type: 'expense', date: { gte: start } },
      select: { amount: true, date: true },
    });

    const result: { month: string; revenue: number; profit: number; expenses: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });

      const rev = invoices
        .filter((inv) => {
          if (!inv.finalizedAt) return false;
          const k = `${inv.finalizedAt.getFullYear()}-${String(inv.finalizedAt.getMonth() + 1).padStart(2, '0')}`;
          return k === key;
        })
        .reduce((s, i) => s + i.total, 0);

      const exp = expenses
        .filter((e) => {
          const k = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
          return k === key;
        })
        .reduce((s, e) => s + e.amount, 0);

      result.push({ month: label, revenue: rev, profit: rev - exp, expenses: exp });
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});
// GET /api/dashboard/recent-invoices
router.get('/recent-invoices', async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { companyId: req.user?.companyId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { firstName: true, lastName: true } } }
    });
    res.json({ success: true, data: invoices });
  } catch (err) { next(err); }
});

// ... add endpoints for top customers, recent activity, tasks, needs attention, etc.

export default router;