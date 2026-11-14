import { Router } from 'express';
import { authenticate } from '../../middleware/auth';

import { prisma } from '../../lib/prisma';
import { stockByProduct } from '../../lib/inventory';
import { resolveLocation, reportLocationIds } from '../../middleware/locationAuth';
import { monthlyPnl, profitAndLoss } from '../../lib/reports';
const router = Router();

router.use(authenticate);

// SALES BY MONTH — revenue per month from the ledger (finalized invoices
// minus cancellations), the same figure as the P&L and dashboard.
router.get('/sales-by-month', resolveLocation, async (req, res, next) => {
  try {
    const months = Math.min(Math.max(parseInt(String(req.query.months || '12')) || 12, 1), 24);
    const rows = await monthlyPnl(req.user!.companyId, months, await reportLocationIds(req));
    res.json({ success: true, data: rows.map((r) => ({ month: r.key, total: r.revenue })) });
  } catch (err) { next(err); }
});

// SALES BY PRODUCT
router.get('/sales-by-product', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const items = await prisma.invoiceItem.findMany({
      where: { invoice: { companyId, status: { notIn: ['draft', 'cancelled'] } } },
      include: { product: { select: { name: true, sku: true } } },
    });

    const map: Record<string, { name: string; sku: string | null; quantity: number; total: number }> = {};
    for (const it of items) {
      const key = it.productId || `custom-${it.description}`;
      if (!map[key]) {
        map[key] = {
          name: it.product?.name || it.description,
          sku: it.product?.sku || null,
          quantity: 0,
          total: 0,
        };
      }
      map[key].quantity += it.quantity;
      map[key].total += it.total;
    }
    const data = Object.values(map).sort((a, b) => b.total - a.total);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// TOP CUSTOMERS
router.get('/top-customers', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const invoices = await prisma.invoice.findMany({
      where: { companyId, status: { notIn: ['draft', 'cancelled'] } },
      include: { customer: { select: { firstName: true, lastName: true, id: true } } },
    });

    const map: Record<string, { name: string; total: number; invoices: number; outstanding: number }> = {};
    for (const inv of invoices) {
      if (!inv.customer) continue;
      const key = inv.customer.id;
      if (!map[key]) {
        map[key] = {
          name: `${inv.customer.firstName} ${inv.customer.lastName}`,
          total: 0,
          invoices: 0,
          outstanding: 0,
        };
      }
      map[key].total += inv.total;
      map[key].invoices += 1;
      map[key].outstanding += inv.total - inv.amountPaid;
    }
    const data = Object.values(map).sort((a, b) => b.total - a.total);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// INVENTORY VALUATION
// Value at cost comes from the actual batches (each at its own purchase or
// production cost), not quantity × latest cost.
router.get('/inventory-valuation', resolveLocation, async (req, res, next) => {
  try {
    const companyId = req.user!.companyId;
    const products = await prisma.product.findMany({
      where: { companyId },
      select: { id: true, name: true, sku: true, cost: true, price: true },
      orderBy: { name: 'asc' },
    });
    const stock = await stockByProduct(prisma, companyId, req.locationId ?? req.allowedLocationIds);
    const data = products.map(({ id, ...p }) => {
      const s = stock.get(id) || { quantity: 0, value: 0 };
      return {
        ...p,
        quantity: s.quantity,
        valueAtCost: s.value,
        valueAtPrice: Math.round(s.quantity * p.price * 100) / 100,
      };
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// EXPENSES BY CATEGORY — operating expenses from the P&L (all time unless from/to given).
router.get('/expenses-by-category', resolveLocation, async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const pnl = await profitAndLoss(req.user!.companyId, { from, to, locationIds: await reportLocationIds(req) });
    res.json({
      success: true,
      data: pnl.expenseBreakdown.map((e) => ({ name: e.account, total: e.amount })),
    });
  } catch (err) { next(err); }
});

// SALES BY PAYMENT METHOD
router.get('/sales-by-method', async (req, res, next) => {
  try {
    const rows = await prisma.payment.groupBy({
      by: ['method'],
      where: { companyId: req.user?.companyId },
      _sum: { amount: true },
      _count: true,
    });
    res.json({
      success: true,
      data: rows.map((r) => ({
        method: r.method,
        total: r._sum.amount || 0,
        count: r._count,
      })),
    });
  } catch (err) { next(err); }
});

export default router;