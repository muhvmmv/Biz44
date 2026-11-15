import { Router } from 'express';
import { authenticate } from '../../middleware/auth';

import { prisma } from '../../lib/prisma';
import { stockByProduct } from '../../lib/inventory';
import { resolveLocation, reportLocationIds } from '../../middleware/locationAuth';
import { monthlyPnl, profitAndLoss } from '../../lib/reports';
import { round2 } from '../../lib/ledger';
import { badRequest } from '../../lib/errors';
import { productionSummary } from '../production/production.service';
import { invoiceBalance } from '../../lib/invoiceBalance';
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
      map[key].outstanding += invoiceBalance(inv);
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
      select: { id: true, name: true, sku: true, cost: true, price: true, unit: true },
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

function reportDate(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw badRequest(`Invalid date: ${value}`);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) d.setHours(23, 59, 59, 999);
  return d;
}

// PRODUCT MARGINS — what each product earned after its actual batch cost.
// Revenue is net of invoice discounts (shared across lines by value) and
// excludes VAT; cost is the FIFO cost of the batches each sale used.
router.get('/product-margins', resolveLocation, async (req, res, next) => {
  try {
    const companyId = req.user!.companyId;
    const from = reportDate(req.query.from);
    const to = reportDate(req.query.to, true);
    const locationIds = await reportLocationIds(req);
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { notIn: ['draft', 'cancelled'] },
        finalizedAt: { not: null, ...(from && { gte: from }), ...(to && { lte: to }) },
        ...(locationIds && { locationId: { in: locationIds } }),
      },
      include: { items: { include: { product: { select: { name: true, unit: true, itemType: true } } } } },
    });
    const movements = invoices.length
      ? await prisma.stockMovement.findMany({
          where: { companyId, type: 'sale', reference: { in: invoices.map((i) => i.invoiceNumber) } },
          select: { productId: true, reference: true, totalCost: true },
        })
      : [];
    const costOf = new Map<string, number>();
    for (const m of movements) {
      const key = `${m.reference}|${m.productId}`;
      costOf.set(key, (costOf.get(key) ?? 0) + m.totalCost);
    }
    type Row = { productId: string | null; name: string; unit: string | null; quantity: number; revenue: number; cost: number };
    const rows = new Map<string, Row>();
    for (const inv of invoices) {
      const share = inv.subtotal > 0 ? 1 - inv.discountTotal / inv.subtotal : 1;
      const counted = new Set<string>();
      for (const it of inv.items) {
        const key = it.productId ?? `custom:${it.description}`;
        const row = rows.get(key) ?? { productId: it.productId, name: it.product?.name ?? it.description, unit: it.product?.unit ?? null, quantity: 0, revenue: 0, cost: 0 };
        row.quantity += it.quantity;
        row.revenue += it.total * share;
        // A product on several lines of one invoice: its cost is counted once.
        if (it.productId && !counted.has(it.productId)) {
          row.cost += costOf.get(`${inv.invoiceNumber}|${it.productId}`) ?? 0;
          counted.add(it.productId);
        }
        rows.set(key, row);
      }
    }
    // Credit notes on these invoices take back their sales and, for goods put
    // back into stock, their cost.
    const credits = invoices.length
      ? await prisma.creditNoteLine.findMany({
          where: { creditNote: { invoiceId: { in: invoices.map((i) => i.id) } } },
          include: { invoiceItem: { select: { productId: true, description: true } } },
        })
      : [];
    for (const c of credits) {
      const key = c.invoiceItem.productId ?? `custom:${c.invoiceItem.description}`;
      const row = rows.get(key);
      if (!row) continue;
      row.quantity -= c.quantity;
      row.revenue -= c.total;
      row.cost -= c.cost;
    }
    const data = Array.from(rows.values())
      .map((r) => {
        const revenue = round2(r.revenue), cost = round2(r.cost), profit = round2(revenue - cost);
        return {
          ...r, quantity: Math.round(r.quantity * 10000) / 10000, revenue, cost, profit,
          marginPercent: revenue > 0 ? round2((profit / revenue) * 100) : null,
          unitPrice: r.quantity > 0 ? round2(revenue / r.quantity) : 0,
          unitCost: r.quantity > 0 ? round2(cost / r.quantity) : 0,
        };
      })
      .sort((a, b) => b.profit - a.profit);
    const revenue = round2(data.reduce((s, r) => s + r.revenue, 0));
    const cost = round2(data.reduce((s, r) => s + r.cost, 0));
    res.json({
      success: true,
      data: {
        products: data,
        totals: { revenue, cost, profit: round2(revenue - cost), marginPercent: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : null },
      },
    });
  } catch (err) { next(err); }
});

// PRODUCTION — completed runs, yields and costs for a period.
router.get('/production', resolveLocation, async (req, res, next) => {
  try {
    const data = await productionSummary(
      req.user!.companyId, reportDate(req.query.from), reportDate(req.query.to, true), await reportLocationIds(req)
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// STOCK MOVEMENT — opening, in, out and closing quantity per product for a
// period. Closing comes from the stock batches now, less anything after `to`,
// so it always agrees with the inventory figures.
const MOVEMENT_GROUPS: Record<string, string> = {
  opening: 'received', receipt: 'received',
  production_output: 'produced',
  production_issue: 'usedInProduction', production_return: 'usedInProduction',
  sale: 'sold', return: 'sold',
  supplier_return: 'returnedToSupplier',
  transfer_in: 'transferred', transfer_out: 'transferred',
  adjustment: 'adjusted', count: 'adjusted', damage: 'adjusted',
};

router.get('/stock-movement', resolveLocation, async (req, res, next) => {
  try {
    const companyId = req.user!.companyId;
    const from = reportDate(req.query.from);
    const to = reportDate(req.query.to, true);
    const location = req.locationId ?? req.allowedLocationIds;
    const locWhere = Array.isArray(location) ? { locationId: { in: location } } : { locationId: location };
    const [products, stock, movements] = await Promise.all([
      prisma.product.findMany({ where: { companyId }, select: { id: true, name: true, unit: true, itemType: true }, orderBy: { name: 'asc' } }),
      stockByProduct(prisma, companyId, location),
      prisma.stockMovement.findMany({
        where: { companyId, ...locWhere, ...(from && { createdAt: { gte: from } }) },
        select: { productId: true, type: true, quantity: true, totalCost: true, createdAt: true },
      }),
    ]);
    type Groups = Record<'received' | 'produced' | 'usedInProduction' | 'sold' | 'returnedToSupplier' | 'transferred' | 'adjusted', number>;
    const blank = (): Groups => ({ received: 0, produced: 0, usedInProduction: 0, sold: 0, returnedToSupplier: 0, transferred: 0, adjusted: 0 });
    const per = new Map<string, { inPeriod: Groups; value: Groups; after: number }>();
    for (const m of movements) {
      const row = per.get(m.productId) ?? { inPeriod: blank(), value: blank(), after: 0 };
      if (to && m.createdAt > to) {
        row.after += m.quantity;
      } else {
        const g = (MOVEMENT_GROUPS[m.type] ?? 'adjusted') as keyof Groups;
        row.inPeriod[g] += m.quantity;
        row.value[g] += Math.sign(m.quantity) * m.totalCost;
      }
      per.set(m.productId, row);
    }
    const q = (n: number) => Math.round(n * 10000) / 10000;
    const data = products
      .map((p) => {
        const row = per.get(p.id) ?? { inPeriod: blank(), value: blank(), after: 0 };
        const closing = q((stock.get(p.id)?.quantity ?? 0) - row.after);
        const net = Object.values(row.inPeriod).reduce((s, v) => s + v, 0);
        const groups = Object.fromEntries(Object.entries(row.inPeriod).map(([k, v]) => [k, q(v)])) as Groups;
        const values = Object.fromEntries(Object.entries(row.value).map(([k, v]) => [k, round2(v)])) as Groups;
        return { productId: p.id, name: p.name, unit: p.unit, itemType: p.itemType, opening: q(closing - net), ...groups, values, closing };
      })
      .filter((r) => r.opening !== 0 || r.closing !== 0 || Object.values(r.values).some((v) => v !== 0) || r.received || r.sold || r.produced || r.usedInProduction || r.adjusted || r.returnedToSupplier || r.transferred);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;