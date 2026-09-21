import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// SALES BY MONTH (last 12 months)
router.get('/sales-by-month', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const invoices = await prisma.invoice.findMany({
      where: { companyId, status: { not: 'draft' }, finalizedAt: { not: null } },
      select: { total: true, finalizedAt: true },
    });

    const byMonth: Record<string, number> = {};
    for (const inv of invoices) {
      if (!inv.finalizedAt) continue;
      const key = `${inv.finalizedAt.getFullYear()}-${String(inv.finalizedAt.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = (byMonth[key] || 0) + inv.total;
    }
    const data = Object.entries(byMonth)
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// SALES BY PRODUCT
router.get('/sales-by-product', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const items = await prisma.invoiceItem.findMany({
      where: { invoice: { companyId, status: { not: 'draft' } } },
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
      where: { companyId, status: { not: 'draft' } },
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
router.get('/inventory-valuation', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { companyId: req.user?.companyId },
      select: { name: true, sku: true, quantity: true, cost: true, price: true },
    });
    const data = products.map((p) => ({
      ...p,
      valueAtCost: p.quantity * p.cost,
      valueAtPrice: p.quantity * p.price,
    }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// EXPENSES BY CATEGORY
router.get('/expenses-by-category', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const rows = await prisma.transaction.groupBy({
      by: ['accountId'],
      where: { companyId, type: 'expense' },
      _sum: { amount: true },
    });
    const accounts = await prisma.account.findMany({ where: { companyId } });
    const nameMap = new Map(accounts.map((a) => [a.id, a.name]));
    const data = rows.map((r) => ({
      name: nameMap.get(r.accountId) || 'Unknown',
      total: r._sum.amount || 0,
    })).sort((a, b) => b.total - a.total);
    res.json({ success: true, data });
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