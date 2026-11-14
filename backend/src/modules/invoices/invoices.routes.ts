import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, guardRecordLocation } from '../../middleware/locationAuth';

import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import {
  findOrCreateAccount, resolvePaymentAccount, parsePositiveAmount, parsePositiveQuantity,
} from '../../lib/accounts';
const router = Router();

router.use(authenticate);

// Every /:id route: the invoice must belong to this company and to a
// location the user can access.
router.param(
  'id',
  guardRecordLocation((id, companyId) =>
    prisma.invoice.findFirst({ where: { id, companyId }, select: { locationId: true } })
  )
);

async function nextInvoiceNumber(companyId: string) {
  // Find the highest existing invoice number (safe against deletes)
  const lastInvoice = await prisma.invoice.findFirst({
    where: { companyId, invoiceNumber: { startsWith: 'INV-' } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let nextNumber = 1;
  if (lastInvoice) {
    const numPart = lastInvoice.invoiceNumber.replace('INV-', '');
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) nextNumber = parsed + 1;
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `INV-${String(nextNumber).padStart(4, '0')}`;
    const exists = await prisma.invoice.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    nextNumber++;
  }

  return `INV-${Date.now()}`;
}

const PAYABLE_STATUSES = ['unpaid', 'partially_paid', 'overdue'];

interface CleanItem {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Validate invoice lines and make sure every product and the customer
 * belong to this company. Returns cleaned lines.
 */
async function validateInvoiceInput(companyId: string, body: any): Promise<CleanItem[]> {
  const { items, customerId, customerName } = body || {};
  if (!Array.isArray(items) || items.length === 0) throw badRequest('At least one item required');
  if (!customerId && !(typeof customerName === 'string' && customerName.trim())) {
    throw badRequest('Customer is required');
  }
  if (customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
    if (!customer) throw notFound('Customer not found');
  }

  const clean: CleanItem[] = items.map((it: any, i: number) => {
    const unitPrice = Number(it?.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw badRequest(`Line ${i + 1}: price must be 0 or more`);
    const description = typeof it?.description === 'string' ? it.description.trim() : '';
    if (!description) throw badRequest(`Line ${i + 1}: description is required`);
    return {
      productId: it?.productId ? String(it.productId) : null,
      description,
      quantity: parsePositiveQuantity(it?.quantity, `Line ${i + 1} quantity`),
      unitPrice,
    };
  });

  const productIds = Array.from(new Set(clean.map((c) => c.productId).filter(Boolean))) as string[];
  if (productIds.length > 0) {
    const owned = await prisma.product.count({ where: { id: { in: productIds }, companyId } });
    if (owned !== productIds.length) throw notFound('One or more products were not found');
  }
  return clean;
}

function targetLocationId(req: Request): string {
  return req.locationId || req.allowedLocationIds[0];
}

// ---------- LIST (location-scoped) ----------
router.get('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { companyId: req.user?.companyId, ...locationWhere(req) },
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { firstName: true, lastName: true } } },
    });
    res.json({ success: true, data: invoices });
  } catch (err) { next(err); }
});

// ---------- GET ONE ----------
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.user?.companyId },
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

// ---------- CREATE (draft) ----------
router.post('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const {
      customerId, customerName, customerAddress, customerEmail, customerPhone,
      dueDate, notes,
    } = req.body;
    const items = await validateInvoiceInput(companyId, req.body);

    let subtotal = 0;
    for (const it of items) subtotal += it.quantity * it.unitPrice;
    const total = subtotal;

    const invoiceNumber = await nextInvoiceNumber(companyId);

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        locationId: targetLocationId(req),
        customerId: customerId || null,
        customerName: customerId ? null : customerName || null,
        customerAddress: customerId ? null : customerAddress || null,
        customerEmail: customerId ? null : customerEmail || null,
        customerPhone: customerId ? null : customerPhone || null,
        invoiceNumber,
        status: 'draft',
        subtotal,
        discountTotal: 0,
        taxTotal: 0,
        total,
        notes,
        dueDate: dueDate ? new Date(dueDate) : null,
        items: {
          create: items.map((it) => ({
            productId: it.productId,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.quantity * it.unitPrice,
          })),
        },
      },
      include: { items: true },
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

// ---------- UPDATE (only drafts) ----------
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.user?.companyId },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    if (existing.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only drafts can be edited' });
    }

    const {
      customerId, customerName, customerAddress, customerEmail, customerPhone,
      dueDate, notes,
    } = req.body;
    const items = await validateInvoiceInput(existing.companyId, req.body);

    let subtotal = 0;
    for (const it of items) subtotal += it.quantity * it.unitPrice;
    const total = subtotal;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
      return tx.invoice.update({
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
          create: items.map((it) => ({
            productId: it.productId,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.quantity * it.unitPrice,
          })),
        },
      },
      include: { items: true },
      });
    });

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ---------- FINALIZE ----------
// IMPORTANT: this handler validates ONLY:
//   1. Invoice is in draft status
//   2. There is enough actual stock (product.quantity >= requested quantity)
//   3. There are enough batch quantities to cover the sale via FIFO
//
// It MUST NOT block the sale based on the product's reorderPoint.
// The reorder point is a WARNING threshold shown in the UI, not a
// hard limit on selling available stock.
router.post('/:id/finalize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId },
      include: { items: true },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only drafts can be finalized' });
    }

    await prisma.$transaction(async (tx) => {
      let totalCogs = 0;

      for (const item of invoice.items) {
        if (!item.productId) continue;

        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product) throw notFound(`Product on line "${item.description}" no longer exists`);

        // ========== THE ONLY STOCK VALIDATION ==========
        // Blocks ONLY when there is genuinely not enough stock.
        // Does NOT reference product.reorderPoint.
        if (product.quantity < item.quantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Available: ${product.quantity}`
          );
        }
        // ==============================================

        const batches = await tx.inventoryBatch.findMany({
          where: {
            productId: item.productId,
            quantityRemaining: { gt: 0 },
            ...(invoice.locationId ? { locationId: invoice.locationId } : {}),
          },
          orderBy: { receivedAt: 'asc' }, // FIFO
        });

        let remaining = item.quantity;
        let productBalance = product.quantity;

        for (const batch of batches) {
          if (remaining <= 0) break;
          const consume = Math.min(batch.quantityRemaining, remaining);
          const cogs = consume * batch.unitCost;
          totalCogs += cogs;

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { quantityRemaining: batch.quantityRemaining - consume },
          });

          productBalance -= consume;

          await tx.stockMovement.create({
            data: {
              companyId,
              locationId: invoice.locationId,
              productId: item.productId,
              batchId: batch.id,
              type: 'sale',
              quantity: -consume,
              balance: productBalance,
              unitCost: batch.unitCost,
              totalCost: cogs,
              reference: invoice.invoiceNumber,
            },
          });

          remaining -= consume;
        }

        if (remaining > 0) {
          throw new Error(`Insufficient batch stock for ${product.name}`);
        }

        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: product.quantity - item.quantity },
        });
      }

      // Recompute product totalCostValue from remaining batches
      const touched = Array.from(
        new Set(invoice.items.map((i) => i.productId).filter(Boolean))
      ) as string[];
      for (const pid of touched) {
        const remainingBatches = await tx.inventoryBatch.findMany({
          where: { productId: pid, quantityRemaining: { gt: 0 } },
        });
        const totalValue = remainingBatches.reduce(
          (s, b) => s + b.quantityRemaining * b.unitCost,
          0
        );
        await tx.product.update({
          where: { id: pid },
          data: { totalCostValue: totalValue },
        });
      }

      // Revenue
      const salesAccount = await findOrCreateAccount(tx, companyId, 'Sales Revenue', 'revenue');
      const arAccount = await findOrCreateAccount(tx, companyId, 'Accounts Receivable', 'asset');

      await tx.transaction.create({
        data: {
          companyId,
          locationId: invoice.locationId,
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

      // COGS
      if (totalCogs > 0) {
        const cogsAccount = await findOrCreateAccount(tx, companyId, 'Cost of Goods Sold', 'expense');
        const inventoryAccount = await findOrCreateAccount(tx, companyId, 'Inventory', 'asset');

        await tx.transaction.create({
          data: {
            companyId,
            locationId: invoice.locationId,
            accountId: cogsAccount.id,
            type: 'cogs',
            description: `COGS for ${invoice.invoiceNumber}`,
            amount: totalCogs,
            date: new Date(),
          },
        });
        await tx.account.update({
          where: { id: cogsAccount.id },
          data: { balance: { increment: totalCogs } },
        });
        await tx.account.update({
          where: { id: inventoryAccount.id },
          data: { balance: { decrement: totalCogs } },
        });
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'unpaid', finalizedAt: new Date() },
      });
    });

    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.startsWith('Insufficient')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
});

// ---------- RECORD PAYMENT ----------
router.post('/:id/payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const { method = 'cash', reference, notes } = req.body;
    const amount = parsePositiveAmount(req.body?.amount);

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });

    if (!PAYABLE_STATUSES.includes(invoice.status)) {
      const reason =
        invoice.status === 'draft' ? 'Finalize the invoice before recording a payment' :
        invoice.status === 'paid' ? 'This invoice is already fully paid' :
        `Payments cannot be recorded on a ${invoice.status} invoice`;
      throw badRequest(reason);
    }
    const balance = invoice.total - invoice.amountPaid;
    if (amount > balance + 0.01) {
      throw badRequest(`Amount is more than the balance due (${balance.toFixed(2)})`);
    }

    // Validate the receiving account before writing anything.
    const receiveAccount = await resolvePaymentAccount(prisma, companyId, {
      accountId: req.body?.accountId,
      account: req.body?.account,
    });

    const newPaid = invoice.amountPaid + amount;
    let newStatus = invoice.status;
    if (newPaid >= invoice.total - 0.01) newStatus = 'paid';
    else if (newPaid > 0) newStatus = 'partially_paid';

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          companyId,
          locationId: invoice.locationId,
          invoiceId: invoice.id,
          amount,
          method,
          reference,
          notes,
        },
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: newPaid, status: newStatus },
      });

      const cashAccount = receiveAccount;
      const arAccount = await findOrCreateAccount(tx, companyId, 'Accounts Receivable', 'asset');

      await tx.transaction.create({
        data: {
          companyId,
          locationId: invoice.locationId,
          accountId: cashAccount.id,
          type: 'payment',
          description: `Payment for ${invoice.invoiceNumber}`,
          amount,
          date: new Date(),
        },
      });
      await tx.account.update({
        where: { id: cashAccount.id },
        data: { balance: { increment: amount } },
      });
      await tx.account.update({
        where: { id: arAccount.id },
        data: { balance: { decrement: amount } },
      });
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- CANCEL ----------
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId },
      include: { items: true },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Already cancelled' });
    }

    await prisma.$transaction(async (tx) => {
      if (invoice.finalizedAt) {
        const movements = await tx.stockMovement.findMany({
          where: { companyId, reference: invoice.invoiceNumber, type: 'sale' },
        });

        let totalCogsReversed = 0;
        for (const m of movements) {
          totalCogsReversed += m.totalCost;

          if (m.batchId) {
            const batch = await tx.inventoryBatch.findFirst({ where: { id: m.batchId, companyId } });
            if (batch) {
              await tx.inventoryBatch.update({
                where: { id: batch.id },
                data: { quantityRemaining: batch.quantityRemaining + Math.abs(m.quantity) },
              });
            }
          }

          const product = await tx.product.findFirst({ where: { id: m.productId, companyId } });
          if (product) {
            await tx.product.update({
              where: { id: product.id },
              data: {
                quantity: product.quantity + Math.abs(m.quantity),
                totalCostValue: product.totalCostValue + m.totalCost,
              },
            });
          }

          await tx.stockMovement.create({
            data: {
              companyId,
              locationId: m.locationId,
              productId: m.productId,
              batchId: m.batchId,
              type: 'return',
              quantity: Math.abs(m.quantity),
              balance: 0,
              unitCost: m.unitCost,
              totalCost: m.totalCost,
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
            locationId: invoice.locationId,
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

        if (totalCogsReversed > 0) {
          const cogsAccount = await findOrCreateAccount(tx, companyId, 'Cost of Goods Sold', 'expense');
          const inventoryAccount = await findOrCreateAccount(tx, companyId, 'Inventory', 'asset');

          await tx.transaction.create({
            data: {
              companyId,
              locationId: invoice.locationId,
              accountId: cogsAccount.id,
              type: 'refund',
              description: `COGS reversal for ${invoice.invoiceNumber}`,
              amount: -totalCogsReversed,
              date: new Date(),
            },
          });
          await tx.account.update({
            where: { id: cogsAccount.id },
            data: { balance: { decrement: totalCogsReversed } },
          });
          await tx.account.update({
            where: { id: inventoryAccount.id },
            data: { balance: { increment: totalCogsReversed } },
          });
        }
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
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId: req.user?.companyId },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only drafts can be deleted' });
    }
    await prisma.invoice.delete({ where: { id: invoice.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;