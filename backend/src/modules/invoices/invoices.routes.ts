import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// Helper to generate next invoice number
async function nextInvoiceNumber(companyId: string) {
  const count = await prisma.invoice.count({ where: { companyId } });
  return `INV-${String(count + 1).padStart(4, '0')}`;
}

// Helper: find or create account
async function findOrCreateAccount(tx: any, companyId: string, name: string, type: string) {
  const existing = await tx.account.findFirst({ where: { companyId, name } });
  if (existing) return existing;
  return tx.account.create({ data: { companyId, name, type, balance: 0 } });
}

// ---------- LIST ----------
router.get('/', async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { companyId: req.user?.companyId },
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { firstName: true, lastName: true } } },
    });
    res.json({ success: true, data: invoices });
  } catch (err) { next(err); }
});

// ---------- GET ONE ----------
router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: { include: { product: { select: { name: true, sku: true } } } },
        payments: true,
      },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

// ---------- CREATE (as draft) ----------
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const {
      customerId,
      customerName,
      customerAddress,
      customerEmail,
      customerPhone,
      dueDate,
      notes,
      items,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item required' });
    }

    if (!customerId && !customerName) {
      return res.status(400).json({ success: false, message: 'Customer is required' });
    }

    let subtotal = 0;
    for (const it of items) {
      subtotal += Number(it.quantity) * Number(it.unitPrice);
    }
    const discountTotal = 0;
    const taxTotal = 0;
    const total = subtotal - discountTotal + taxTotal;

    const invoiceNumber = await nextInvoiceNumber(companyId);

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        customerId: customerId || null,
        customerName: customerId ? null : customerName || null,
        customerAddress: customerId ? null : customerAddress || null,
        customerEmail: customerId ? null : customerEmail || null,
        customerPhone: customerId ? null : customerPhone || null,
        invoiceNumber,
        status: 'draft',
        subtotal,
        discountTotal,
        taxTotal,
        total,
        notes,
        dueDate: dueDate ? new Date(dueDate) : null,
        items: {
          create: items.map((it: any) => ({
            productId: it.productId || null,
            description: it.description,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            total: Number(it.quantity) * Number(it.unitPrice),
          })),
        },
      },
      include: { items: true },
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

// ---------- UPDATE (only drafts) ----------
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    if (existing.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only drafts can be edited' });
    }

    const {
      customerId,
      customerName,
      customerAddress,
      customerEmail,
      customerPhone,
      dueDate,
      notes,
      items,
    } = req.body;

    let subtotal = 0;
    for (const it of items) {
      subtotal += Number(it.quantity) * Number(it.unitPrice);
    }
    const total = subtotal;

    await prisma.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });

    const updated = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        customerId: customerId || null,
        customerName: customerId ? null : customerName || null,
        customerAddress: customerId ? null : customerAddress || null,
        customerEmail: customerId ? null : customerEmail || null,
        customerPhone: customerId ? null : customerPhone || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
        subtotal,
        total,
        items: {
          create: items.map((it: any) => ({
            productId: it.productId || null,
            description: it.description,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            total: Number(it.quantity) * Number(it.unitPrice),
          })),
        },
      },
      include: { items: true },
    });

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ---------- FINALIZE ----------
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only drafts can be finalized' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Deduct stock
      for (const item of invoice.items) {
        if (!item.productId) continue;

        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const newBalance = product.quantity - item.quantity;
        if (newBalance < 0) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.quantity}`);
        }

        await tx.product.update({
          where: { id: product.id },
          data: { quantity: newBalance },
        });

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: product.id,
            type: 'sale',
            quantity: -item.quantity,
            balance: newBalance,
            reference: invoice.invoiceNumber,
          },
        });
      }

      // 2. Accounting ledger
      const salesAccount = await findOrCreateAccount(tx, companyId, 'Sales Revenue', 'revenue');
      const arAccount = await findOrCreateAccount(tx, companyId, 'Accounts Receivable', 'asset');

      await tx.transaction.create({
        data: {
          companyId,
          accountId: salesAccount.id,
          type: 'sale',
          description: `Invoice ${invoice.invoiceNumber}`,
          amount: invoice.total,
          date: new Date(),
        },
      });
      await tx.account.update({
        where: { id: salesAccount.id },
        data: { balance: { increment: invoice.total } },
      });
      await tx.account.update({
        where: { id: arAccount.id },
        data: { balance: { increment: invoice.total } },
      });

      // 3. Update invoice status
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'unpaid', finalizedAt: new Date() },
      });
    });

    res.json({ success: true });
  } catch (err: any) {
    if (err.message && err.message.startsWith('Insufficient')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
});

// ---------- RECORD PAYMENT ----------
router.post('/:id/payment', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const { amount, method = 'cash', reference, notes } = req.body;

    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });

    const newPaid = invoice.amountPaid + Number(amount);
    let newStatus = invoice.status;
    if (newPaid >= invoice.total - 0.01) newStatus = 'paid';
    else if (newPaid > 0) newStatus = 'partially_paid';

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          companyId,
          invoiceId: invoice.id,
          amount: Number(amount),
          method,
          reference,
          notes,
        },
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: newPaid, status: newStatus },
      });

      const cashAccount = await findOrCreateAccount(tx, companyId, 'Cash', 'asset');
      const arAccount = await findOrCreateAccount(tx, companyId, 'Accounts Receivable', 'asset');

      await tx.transaction.create({
        data: {
          companyId,
          accountId: cashAccount.id,
          type: 'payment',
          description: `Payment for ${invoice.invoiceNumber}`,
          amount: Number(amount),
          date: new Date(),
        },
      });
      await tx.account.update({
        where: { id: cashAccount.id },
        data: { balance: { increment: Number(amount) } },
      });
      await tx.account.update({
        where: { id: arAccount.id },
        data: { balance: { decrement: Number(amount) } },
      });
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- CANCEL ----------
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Already cancelled' });
    }

    await prisma.$transaction(async (tx) => {
      if (invoice.finalizedAt) {
        for (const item of invoice.items) {
          if (!item.productId) continue;
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          const newBalance = product.quantity + item.quantity;
          await tx.product.update({
            where: { id: product.id },
            data: { quantity: newBalance },
          });

          await tx.stockMovement.create({
            data: {
              companyId,
              productId: product.id,
              type: 'return',
              quantity: item.quantity,
              balance: newBalance,
              reference: invoice.invoiceNumber,
              notes: 'Cancelled invoice reversal',
            },
          });
        }

        const salesAccount = await findOrCreateAccount(tx, companyId, 'Sales Revenue', 'revenue');
        const arAccount = await findOrCreateAccount(tx, companyId, 'Accounts Receivable', 'asset');

        await tx.transaction.create({
          data: {
            companyId,
            accountId: salesAccount.id,
            type: 'refund',
            description: `Cancellation of ${invoice.invoiceNumber}`,
            amount: -invoice.total,
            date: new Date(),
          },
        });
        await tx.account.update({
          where: { id: salesAccount.id },
          data: { balance: { decrement: invoice.total } },
        });
        await tx.account.update({
          where: { id: arAccount.id },
          data: { balance: { decrement: invoice.total } },
        });
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'cancelled' },
      });
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- DELETE (only drafts) ----------
router.delete('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only drafts can be deleted' });
    }
    await prisma.invoice.delete({ where: { id: invoice.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;