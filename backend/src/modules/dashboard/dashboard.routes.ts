import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, reportLocationIds } from '../../middleware/locationAuth';

import { prisma } from '../../lib/prisma';
import { stockByProduct } from '../../lib/inventory';
import { purchaseBalance } from '../purchases/purchase.service';
import { profitAndLoss, cashFlow, monthlyPnl } from '../../lib/reports';
import { listPaymentAccounts } from '../../lib/accounts';
import { runStockCheck } from '../../lib/stockCheck';
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

// ---------- ALERTS ----------
// Things that need attention, computed from live data (nothing is stored).
router.get('/alerts', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locFilter = locationWhere(req);
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [openInvoices, purchases, products, stock, cashAccounts, stockReport] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId, status: { in: ['unpaid', 'partially_paid', 'overdue'] }, ...locFilter },
        select: { total: true, amountPaid: true, dueDate: true },
      }),
      prisma.purchase.findMany({
        where: { companyId, ...locFilter },
        select: { total: true, amountPaid: true, returnedAmount: true, dueDate: true },
      }),
      prisma.product.findMany({ where: { companyId }, select: { id: true, reorderPoint: true } }),
      stockByProduct(prisma, companyId, req.locationId ?? req.allowedLocationIds),
      listPaymentAccounts(prisma, companyId),
      runStockCheck(companyId),
    ]);

    // `amount` (when present) is shown formatted before `detail` by the client.
    const alerts: { id: string; severity: 'danger' | 'warning' | 'info'; title: string; detail: string; amount?: number; href: string; count: number }[] = [];
    const money = (n: number) => Math.round(n * 100) / 100;

    const overdue = openInvoices.filter((i) => i.dueDate && i.dueDate < todayStart);
    if (overdue.length) {
      alerts.push({
        id: 'invoices-overdue', severity: 'danger', count: overdue.length,
        title: `${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}`,
        amount: money(overdue.reduce((s, i) => s + i.total - i.amountPaid, 0)), detail: 'still to collect',
        href: '/dashboard/accounting/receivable',
      });
    }
    const dueToday = openInvoices.filter((i) => i.dueDate && i.dueDate >= todayStart && i.dueDate <= todayEnd);
    if (dueToday.length) {
      alerts.push({
        id: 'invoices-due-today', severity: 'info', count: dueToday.length,
        title: `${dueToday.length} invoice${dueToday.length === 1 ? '' : 's'} due today`,
        amount: money(dueToday.reduce((s, i) => s + i.total - i.amountPaid, 0)), detail: 'expected today',
        href: '/dashboard/invoices',
      });
    }
    const supplierOverdue = purchases.filter((p) => p.dueDate && p.dueDate < todayStart && purchaseBalance(p) > 0.009);
    if (supplierOverdue.length) {
      alerts.push({
        id: 'suppliers-overdue', severity: 'danger', count: supplierOverdue.length,
        title: `${supplierOverdue.length} supplier payment${supplierOverdue.length === 1 ? '' : 's'} overdue`,
        amount: money(supplierOverdue.reduce((s, p) => s + purchaseBalance(p), 0)), detail: 'owed past the due date',
        href: '/dashboard/accounting/payable',
      });
    }
    const qty = (id: string) => stock.get(id)?.quantity ?? 0;
    const out = products.filter((p) => p.reorderPoint > 0 && qty(p.id) <= 0).length;
    const low = products.filter((p) => qty(p.id) > 0 && qty(p.id) <= p.reorderPoint).length;
    if (out) {
      alerts.push({
        id: 'stock-out', severity: 'danger', count: out,
        title: `${out} product${out === 1 ? '' : 's'} out of stock`,
        detail: 'Below the reorder point with nothing on hand', href: '/dashboard/inventory/products',
      });
    }
    if (low) {
      alerts.push({
        id: 'stock-low', severity: 'warning', count: low,
        title: `${low} product${low === 1 ? '' : 's'} running low`,
        detail: 'At or below the reorder point', href: '/dashboard/inventory/products',
      });
    }
    if (stockReport.summary.issues) {
      alerts.push({
        id: 'stock-check', severity: 'warning', count: stockReport.summary.issues,
        title: `Stock check found ${stockReport.summary.issues} problem${stockReport.summary.issues === 1 ? '' : 's'}`,
        detail: 'Recorded stock disagrees with stock batches', href: '/dashboard/inventory/stock-check',
      });
    }
    const negative = cashAccounts.filter((a: any) => a.balance < -0.009);
    if (negative.length) {
      alerts.push({
        id: 'cash-negative', severity: 'warning', count: negative.length,
        title: `${negative.map((a: any) => a.name).join(', ')} below zero`,
        detail: 'Check for a missing payment in, or correct the opening balance', href: '/dashboard/accounting/accounts',
      });
    }

    const order = { danger: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity]);
    res.json({ success: true, data: alerts });
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