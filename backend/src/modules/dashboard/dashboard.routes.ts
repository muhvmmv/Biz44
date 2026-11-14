import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere } from '../../middleware/locationAuth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// ---------- SUMMARY ----------
router.get('/summary', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const locFilter = locationWhere(req);
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const invoices = await prisma.invoice.findMany({
      where: { companyId, status: { not: 'draft' }, ...locFilter },
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

    const thisMonthRevenue = invoices
      .filter((i) => i.finalizedAt && i.finalizedAt >= thisMonthStart)
      .reduce((s, i) => s + i.total, 0);
    const lastMonthRevenue = invoices
      .filter((i) => i.finalizedAt && i.finalizedAt >= lastMonthStart && i.finalizedAt < thisMonthStart)
      .reduce((s, i) => s + i.total, 0);
    const revenueChange = lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : (thisMonthRevenue > 0 ? 100 : 0);

    const cogsAgg = await prisma.transaction.aggregate({
      where: { companyId, type: 'cogs', ...locFilter },
      _sum: { amount: true },
    });
    const totalCogs = cogsAgg._sum.amount || 0;

    const opexAgg = await prisma.transaction.aggregate({
      where: { companyId, type: 'expense', ...locFilter },
      _sum: { amount: true },
    });
    const totalOpex = opexAgg._sum.amount || 0;

    const grossProfit = totalRevenue - totalCogs;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netProfit = grossProfit - totalOpex;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const paymentsAgg = await prisma.payment.aggregate({
      where: { companyId, ...locFilter },
      _sum: { amount: true },
    });
    const cashIn = paymentsAgg._sum.amount || 0;
    const cashOut = totalOpex + totalCogs;
    const netCash = cashIn - cashOut;

    // ---- Supplier outstanding ----
    const purchases = await prisma.purchase.findMany({
      where: { companyId, ...locFilter },
      select: { total: true, amountPaid: true, dueDate: true },
    });
    let supplierOutstanding = 0;
    let supplierUnpaidCount = 0;
    let supplierOverdueAmount = 0;
    let supplierOverdueCount = 0;
    for (const p of purchases) {
      const bal = p.total - p.amountPaid;
      if (bal > 0.01) {
        supplierOutstanding += bal;
        supplierUnpaidCount += 1;
        if (p.dueDate && new Date(p.dueDate) < now) {
          supplierOverdueAmount += bal;
          supplierOverdueCount += 1;
        }
      }
    }

    // ---- Inventory ----
    const products = await prisma.product.findMany({
      where: { companyId },
      select: { quantity: true, reorderPoint: true, price: true, cost: true, totalCostValue: true },
    });
    const totalUnits = products.reduce((s, p) => s + p.quantity, 0);
    const inventoryValue = products.reduce((s, p) => s + p.totalCostValue, 0);
    const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= p.reorderPoint).length;
    const outOfStock = products.filter((p) => p.quantity === 0).length;

    // ---- Top products ----
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
        cogs: totalCogs,
        grossProfit,
        grossMargin,
        opex: totalOpex,
        netProfit,
        netMargin,
        profit: netProfit,
        profitMargin: netMargin,
        expenses: totalOpex,
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
        // NEW: supplier payable metrics
        supplierOutstanding,
        supplierUnpaidCount,
        supplierOverdueAmount,
        supplierOverdueCount,
      },
    });
  } catch (err) { next(err); }
});

// ---------- MONTHLY CHART ----------
router.get('/monthly-chart', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const locFilter = locationWhere(req);
    const months = Math.min(Math.max(parseInt(String(req.query.months || '6')), 1), 12);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const invoices = await prisma.invoice.findMany({
      where: { companyId, finalizedAt: { gte: start }, status: { not: 'cancelled' }, ...locFilter },
      select: { total: true, finalizedAt: true },
    });
    const cogsTx = await prisma.transaction.findMany({
      where: { companyId, type: 'cogs', date: { gte: start }, ...locFilter },
      select: { amount: true, date: true },
    });
    const opexTx = await prisma.transaction.findMany({
      where: { companyId, type: 'expense', date: { gte: start }, ...locFilter },
      select: { amount: true, date: true },
    });

    const result: any[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });

      const rev = invoices
        .filter((inv) => inv.finalizedAt &&
          `${inv.finalizedAt.getFullYear()}-${String(inv.finalizedAt.getMonth() + 1).padStart(2, '0')}` === key)
        .reduce((s, i) => s + i.total, 0);

      const cogs = cogsTx
        .filter((t) => `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}` === key)
        .reduce((s, t) => s + t.amount, 0);

      const opex = opexTx
        .filter((t) => `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}` === key)
        .reduce((s, t) => s + t.amount, 0);

      result.push({
        month: label,
        revenue: rev,
        cogs,
        opex,
        grossProfit: rev - cogs,
        netProfit: rev - cogs - opex,
      });
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ---------- RECENT INVOICES ----------
router.get('/recent-invoices', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { companyId: req.user?.companyId, ...locationWhere(req) },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { firstName: true, lastName: true } } },
    });
    res.json({ success: true, data: invoices });
  } catch (err) { next(err); }
});

export default router;