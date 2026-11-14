import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, reportLocationIds } from '../../middleware/locationAuth';

import { prisma } from '../../lib/prisma';
import { stockByProduct } from '../../lib/inventory';
import { purchaseBalance } from '../purchases/purchase.service';
import { profitAndLoss, cashFlow, monthlyPnl } from '../../lib/reports';
import { listPaymentAccounts } from '../../lib/accounts';
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

    // Period for the money figures: the last N months including this one.
    const months = Math.min(Math.max(parseInt(String(req.query.months || '12')) || 12, 1), 24);
    const periodStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);
    const locationIds = await reportLocationIds(req);

    const [pnl, thisMonth, lastMonth, flow, cashAccounts, invoices] = await Promise.all([
      profitAndLoss(companyId, { from: periodStart, to: now, locationIds }),
      profitAndLoss(companyId, { from: thisMonthStart, to: now, locationIds }),
      profitAndLoss(companyId, { from: lastMonthStart, to: lastMonthEnd, locationIds }),
      cashFlow(companyId, { from: periodStart, to: now }),
      listPaymentAccounts(prisma, companyId),
      prisma.invoice.findMany({
        where: { companyId, status: { notIn: ['draft', 'cancelled'] }, ...locFilter },
        include: { items: { include: { product: { select: { name: true } } } } },
      }),
    ]);

    // Receivables come from the invoices themselves.
    const unpaidInvoices = invoices.filter((i) => ['unpaid', 'overdue', 'partially_paid'].includes(i.status));
    const overdueInvoices = unpaidInvoices.filter((i) => i.dueDate && new Date(i.dueDate) < now);
    const dueTodayInvoices = unpaidInvoices.filter(
      (i) => i.dueDate && new Date(i.dueDate).toDateString() === now.toDateString()
    );
    const outstanding = unpaidInvoices.reduce((s, i) => s + (i.total - i.amountPaid), 0);

    const revenueChange = lastMonth.revenue !== 0
      ? ((thisMonth.revenue - lastMonth.revenue) / Math.abs(lastMonth.revenue)) * 100
      : thisMonth.revenue > 0 ? 100 : 0;

    const totalCash = Math.round(cashAccounts.reduce((s: number, a: any) => s + a.balance, 0) * 100) / 100;

    // ---- Supplier outstanding ----
    const purchases = await prisma.purchase.findMany({
      where: { companyId, ...locFilter },
      select: { total: true, amountPaid: true, returnedAmount: true, dueDate: true },
    });
    let supplierOutstanding = 0;
    let supplierUnpaidCount = 0;
    let supplierOverdueAmount = 0;
    let supplierOverdueCount = 0;
    for (const p of purchases) {
      const bal = purchaseBalance(p);
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
    // Stock comes from batches at the selected location(s), not the
    // company-wide cache, so a single branch shows its own stock.
    const products = await prisma.product.findMany({
      where: { companyId },
      select: { id: true, reorderPoint: true },
    });
    const stock = await stockByProduct(prisma, companyId, req.locationId ?? req.allowedLocationIds);
    const qtyOf = (id: string) => stock.get(id)?.quantity ?? 0;
    const totalUnits = products.reduce((s, p) => s + qtyOf(p.id), 0);
    const inventoryValue = Math.round(
      Array.from(stock.values()).reduce((s, v) => s + v.value, 0) * 100
    ) / 100;
    const lowStock = products.filter((p) => qtyOf(p.id) > 0 && qtyOf(p.id) <= p.reorderPoint).length;
    const outOfStock = products.filter((p) => qtyOf(p.id) === 0).length;

    // ---- Top products ----
    const productSales: Record<string, number> = {};
    for (const inv of invoices) {
      if (!inv.finalizedAt || inv.finalizedAt < periodStart) continue;
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
        months,
        periodStart,
        revenue: pnl.revenue,
        revenueChange,
        revenueThisMonth: thisMonth.revenue,
        revenueLastMonth: lastMonth.revenue,
        cogs: pnl.cogs,
        grossProfit: pnl.grossProfit,
        grossMargin: pnl.grossMargin,
        opex: pnl.totalOpex,
        netProfit: pnl.netProfit,
        netMargin: pnl.netMargin,
        profit: pnl.netProfit,
        profitMargin: pnl.netMargin,
        expenses: pnl.totalOpex,
        // Cash position from the actual cash and bank accounts
        totalCash,
        cashAccounts: cashAccounts.map((a: any) => ({ id: a.id, name: a.name, subtype: a.subtype, balance: Math.round(a.balance * 100) / 100 })),
        cashIn: flow.totalIn,
        cashOut: flow.totalOut,
        netCash: flow.net,
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
// Revenue, COGS, operating expenses and profit per month, from the ledger.
router.get('/monthly-chart', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const months = Math.min(Math.max(parseInt(String(req.query.months || '6')) || 6, 1), 24);
    const data = await monthlyPnl(req.user!.companyId, months, await reportLocationIds(req));
    res.json({ success: true, data });
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