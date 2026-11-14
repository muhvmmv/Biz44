import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, guardRecordLocation, requireTargetLocation } from '../../middleware/locationAuth';

import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import {
  findOrCreateAccount, resolvePaymentAccount, parsePositiveAmount, parsePositiveQuantity,
} from '../../lib/accounts';
import { addStock, consumeFifo, restoreToBatch, syncProductTotals } from '../../lib/inventory';
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

/**
 * Next invoice number for a company: INV-0001, INV-0002, ... Numbers are
 * unique per company (not across companies). Numbers that are not of the
 * short INV-n form (e.g. old timestamp fallbacks) are ignored.
 */
async function nextInvoiceNumber(companyId: string) {
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("invoiceNumber" FROM 5) AS INTEGER)) AS max
    FROM "invoices"
    WHERE "companyId" = ${companyId} AND "invoiceNumber" ~ '^INV-[0-9]{1,7}$'`;
  const next = Number(rows[0]?.max ?? 0) + 1;
  return `INV-${String(next).padStart(4, '0')}`;
}

/** True if a Prisma error is a unique-constraint clash on the invoice number. */
function isInvoiceNumberClash(err: any) {
  return err?.code === 'P2002';
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

    const locationId = requireTargetLocation(req);

    // Two invoices created at the same moment can pick the same number;
    // the unique constraint rejects one, so take the next number and retry.
    let invoice: any;
    for (let attempt = 0; ; attempt++) {
      const invoiceNumber = await nextInvoiceNumber(companyId);
      try {
        invoice = await prisma.invoice.create({
          data: {
            companyId,
            locationId,
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
        break;
      } catch (err) {
        if (isInvoiceNumberClash(err) && attempt < 5) continue;
        throw err;
      }
    }

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
// Validates only that the invoice is a draft and that the invoice's location
// has enough stock (FIFO over its batches). It must NOT block a sale because
// of the reorder point — that is a warning shown in the UI, not a limit.
router.post('/:id/finalize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId },
      include: { items: true },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only drafts can be finalized' });
    }

    await prisma.$transaction(async (tx) => {
      // Claim the draft first so a double click cannot finalize it twice.
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, status: 'draft' },
        data: { status: 'unpaid', finalizedAt: new Date() },
      });
      if (claimed.count === 0) throw badRequest('This invoice was already finalized');

      let totalCogs = 0;
      const productIds: string[] = [];
      for (const item of invoice.items) {
        if (!item.productId) continue;
        const product = await tx.product.findFirst({ where: { id: item.productId, companyId } });
        if (!product) throw notFound(`Product on line "${item.description}" no longer exists`);

        const { totalCost } = await consumeFifo(tx, {
          companyId,
          locationId: invoice.locationId,
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          type: 'sale',
          reference: invoice.invoiceNumber,
        });
        totalCogs += totalCost;
        productIds.push(product.id);
      }
      await syncProductTotals(tx, companyId, productIds);

      // Revenue + receivable
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
        },
      });
      await tx.account.update({ where: { id: salesAccount.id }, data: { balance: { increment: invoice.total } } });
      await tx.account.update({ where: { id: arAccount.id }, data: { balance: { increment: invoice.total } } });

      // Cost of goods sold
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
          },
        });
        await tx.account.update({ where: { id: cogsAccount.id }, data: { balance: { increment: totalCogs } } });
        await tx.account.update({ where: { id: inventoryAccount.id }, data: { balance: { decrement: totalCogs } } });
      }
    });

    res.json({ success: true });
  } catch (err) { next(err); }
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
// Reverses a finalized invoice exactly:
//  - stock goes back into the batches it was sold from (same cost layers)
//  - revenue and COGS are reversed with negative 'sale' / 'cogs' entries so
//    every report that sums them nets the cancellation out
//  - receivables are reduced only by what was still owed
//  - money already received is refunded from the chosen cash/bank account
//    (refundAccountId is required when the invoice has payments)
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, companyId },
      include: { items: true },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Already cancelled' });
    }

    const paid = Math.round(invoice.amountPaid * 100) / 100;
    let refundAccount: any = null;
    if (invoice.finalizedAt && paid > 0) {
      if (!req.body?.refundAccountId) {
        throw badRequest(
          `The customer has paid ${paid.toFixed(2)} on this invoice. ` +
            'Choose the cash or bank account the refund is paid from.'
        );
      }
      refundAccount = await resolvePaymentAccount(prisma, companyId, { accountId: req.body.refundAccountId });
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { not: 'cancelled' } },
        data: { status: 'cancelled' },
      });
      if (claimed.count === 0) throw badRequest('Already cancelled');
      if (!invoice.finalizedAt) return; // a draft has no stock or accounting to reverse

      // 1. Stock back into the original batches
      const saleMovements = await tx.stockMovement.findMany({
        where: { companyId, reference: invoice.invoiceNumber, type: 'sale' },
      });
      let cogsReversed = 0;
      const productIds: string[] = [];
      for (const m of saleMovements) {
        const qty = Math.abs(m.quantity);
        if (m.batchId) {
          await restoreToBatch(tx, {
            companyId, batchId: m.batchId, quantity: qty, type: 'return',
            reference: invoice.invoiceNumber, notes: 'Cancelled invoice',
          });
        } else {
          // Sales made before batches existed: return as a new layer at the sale's cost.
          await addStock(tx, {
            companyId, locationId: m.locationId ?? invoice.locationId, productId: m.productId,
            quantity: qty, unitCost: m.unitCost, type: 'return',
            reference: invoice.invoiceNumber, notes: 'Cancelled invoice',
          });
        }
        cogsReversed += m.totalCost;
        productIds.push(m.productId);
      }
      await syncProductTotals(tx, companyId, productIds);

      // 2. Reverse revenue (negative 'sale') and the receivable still owed
      const salesAccount = await findOrCreateAccount(tx, companyId, 'Sales Revenue', 'revenue');
      const arAccount = await findOrCreateAccount(tx, companyId, 'Accounts Receivable', 'asset');
      const outstanding = Math.max(0, Math.round((invoice.total - invoice.amountPaid) * 100) / 100);
      await tx.transaction.create({
        data: {
          companyId,
          locationId: invoice.locationId,
          accountId: salesAccount.id,
          type: 'sale',
          description: `Cancellation of ${invoice.invoiceNumber}`,
          amount: -invoice.total,
        },
      });
      await tx.account.update({ where: { id: salesAccount.id }, data: { balance: { decrement: invoice.total } } });
      if (outstanding > 0) {
        await tx.account.update({ where: { id: arAccount.id }, data: { balance: { decrement: outstanding } } });
      }

      // 3. Reverse cost of goods sold (negative 'cogs')
      if (cogsReversed > 0) {
        const cogsAccount = await findOrCreateAccount(tx, companyId, 'Cost of Goods Sold', 'expense');
        const inventoryAccount = await findOrCreateAccount(tx, companyId, 'Inventory', 'asset');
        await tx.transaction.create({
          data: {
            companyId,
            locationId: invoice.locationId,
            accountId: cogsAccount.id,
            type: 'cogs',
            description: `COGS reversal for ${invoice.invoiceNumber}`,
            amount: -cogsReversed,
          },
        });
        await tx.account.update({ where: { id: cogsAccount.id }, data: { balance: { decrement: cogsReversed } } });
        await tx.account.update({ where: { id: inventoryAccount.id }, data: { balance: { increment: cogsReversed } } });
      }

      // 4. Refund money already received
      if (paid > 0 && refundAccount) {
        await tx.payment.create({
          data: {
            companyId,
            locationId: invoice.locationId,
            invoiceId: invoice.id,
            amount: -paid,
            method: 'refund',
            reference: req.body?.reference || null,
            notes: `Refund on cancellation (${refundAccount.name})`,
          },
        });
        await tx.account.update({ where: { id: refundAccount.id }, data: { balance: { decrement: paid } } });
        await tx.transaction.create({
          data: {
            companyId,
            locationId: invoice.locationId,
            accountId: refundAccount.id,
            type: 'refund',
            description: `Refund for cancelled ${invoice.invoiceNumber}`,
            amount: -paid,
          },
        });
        await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: 0 } });
      }
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