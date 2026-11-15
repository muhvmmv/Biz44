import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, guardRecordLocation, requireTargetLocation } from '../../middleware/locationAuth';

import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import {
  resolvePaymentAccount, parsePositiveAmount, parsePositiveQuantity,
} from '../../lib/accounts';
import { postJournal, systemAccount, round2 } from '../../lib/ledger';
import { addStock, consumeFifo, restoreToBatch, syncProductTotals, inventoryAccountFor } from '../../lib/inventory';
import { invoiceBalance } from '../../lib/invoiceBalance';
import { createCreditNote, creditableLines } from './creditNotes';
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

/**
 * Invoice totals. A discount is given either as an amount or a percentage of
 * the subtotal (body.discountType = 'amount' | 'percent', body.discountValue).
 * Revenue is recorded net of the discount. VAT (body.taxRate, percent, else the
 * company's VAT rate) is charged on the discounted amount and owed to the tax
 * authority, so it is never revenue.
 */
function invoiceTotals(items: { quantity: number; unitPrice: number }[], body: any, defaultTaxRate = 0) {
  const subtotal = round2(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0));
  const value = body?.discountValue === undefined || body?.discountValue === '' || body?.discountValue === null ? 0 : Number(body.discountValue);
  if (!Number.isFinite(value) || value < 0) throw badRequest('Discount must be 0 or more');
  const type = body?.discountType === 'percent' ? 'percent' : 'amount';
  if (type === 'percent' && value > 100) throw badRequest('Discount cannot be more than 100%');
  const discountTotal = round2(type === 'percent' ? (subtotal * value) / 100 : value);
  if (discountTotal > subtotal + 0.001) throw badRequest('Discount cannot be more than the invoice subtotal');
  const rawRate = body?.taxRate === undefined || body?.taxRate === null || body?.taxRate === '' ? defaultTaxRate : Number(body.taxRate);
  if (!Number.isFinite(rawRate) || rawRate < 0 || rawRate > 100) throw badRequest('VAT rate must be between 0 and 100');
  const taxRate = round2(rawRate);
  const net = round2(subtotal - discountTotal);
  const taxTotal = round2((net * taxRate) / 100);
  return { subtotal, discountTotal, taxRate, taxTotal, total: round2(net + taxTotal) };
}

async function companyVatRate(companyId: string) {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { vatRate: true } });
  return c?.vatRate ?? 0;
}

/**
 * Record a customer payment against an invoice inside a transaction:
 * payment row, invoice paid amount and status, and Dr Cash-or-Bank / Cr Receivables.
 */
async function recordInvoicePayment(
  tx: any,
  args: { invoice: any; amount: number; account: any; method?: string; reference?: string | null; notes?: string | null; userId: string }
) {
  const { invoice, amount, account } = args;
  const current = await tx.invoice.findUnique({ where: { id: invoice.id }, select: { amountPaid: true, total: true, creditedAmount: true } });
  const newPaid = round2(current.amountPaid + amount);
  const left = invoiceBalance({ ...current, amountPaid: newPaid });
  if (left < -0.01) throw badRequest('Payment is more than the balance due');
  const status = left <= 0.01 ? 'paid' : 'partially_paid';
  await tx.payment.create({
    data: {
      companyId: invoice.companyId,
      locationId: invoice.locationId,
      invoiceId: invoice.id,
      amount,
      method: args.method || 'cash',
      reference: args.reference || null,
      notes: args.notes || null,
    },
  });
  await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: newPaid, status } });
  const ar = await systemAccount(tx, invoice.companyId, 'ar');
  await postJournal(tx, {
    companyId: invoice.companyId,
    locationId: invoice.locationId,
    description: `Payment for ${invoice.invoiceNumber}`,
    sourceType: 'invoice_payment',
    sourceId: invoice.id,
    reference: args.reference || invoice.invoiceNumber,
    createdById: args.userId,
    lines: [
      { accountId: account.id, debit: amount },
      { accountId: ar.id, credit: amount },
    ],
  });
  return status;
}

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
        items: { include: { product: { select: { name: true, sku: true, unit: true } } } },
        payments: true,
        creditNotes: { include: { lines: true }, orderBy: { createdAt: 'asc' } },
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

    const { subtotal, discountTotal, taxRate, taxTotal, total } = invoiceTotals(items, req.body, await companyVatRate(companyId));

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
            discountTotal,
            taxRate,
            taxTotal,
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

    // A draft keeps its own rate unless a new one is sent.
    const { subtotal, discountTotal, taxRate, taxTotal, total } = invoiceTotals(items, req.body, existing.taxRate);

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
        discountTotal,
        taxRate,
        taxTotal,
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

    // Optional payment received at the same time (e.g. cash sale).
    const initial = req.body?.payment;
    let initialAmount = 0;
    let initialAccount: any = null;
    if (initial && initial.amount !== undefined && initial.amount !== '' && Number(initial.amount) > 0) {
      initialAmount = parsePositiveAmount(initial.amount, 'Payment amount');
      if (initialAmount > invoice.total + 0.01) throw badRequest('Payment is more than the invoice total');
      initialAccount = await resolvePaymentAccount(prisma, companyId, { accountId: initial.accountId });
    }

    await prisma.$transaction(async (tx) => {
      // Claim the draft first so a double click cannot finalize it twice.
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, status: 'draft' },
        data: { status: 'unpaid', finalizedAt: new Date() },
      });
      if (claimed.count === 0) throw badRequest('This invoice was already finalized');

      let totalCogs = 0;
      // Cost leaves the inventory account of each item's stage.
      const costByAccount = new Map<string, number>();
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
          unit: product.unit,
          quantity: item.quantity,
          type: 'sale',
          reference: invoice.invoiceNumber,
        });
        totalCogs += totalCost;
        const stock = await inventoryAccountFor(tx, companyId, product.itemType);
        costByAccount.set(stock.id, (costByAccount.get(stock.id) ?? 0) + totalCost);
        productIds.push(product.id);
      }
      await syncProductTotals(tx, companyId, productIds);

      // Dr Accounts Receivable / Cr Sales Revenue, and Dr COGS / Cr Inventory
      const ar = await systemAccount(tx, companyId, 'ar');
      const sales = await systemAccount(tx, companyId, 'sales');
      const cogs = await systemAccount(tx, companyId, 'cogs');
      const taxTotal = round2(invoice.taxTotal ?? 0);
      const vat = taxTotal > 0 ? await systemAccount(tx, companyId, 'vat_payable') : null;
      await postJournal(tx, {
        companyId,
        locationId: invoice.locationId,
        description: `Invoice ${invoice.invoiceNumber}`,
        sourceType: 'invoice',
        sourceId: invoice.id,
        reference: invoice.invoiceNumber,
        createdById: req.user!.id,
        lines: [
          { accountId: ar.id, debit: invoice.total },
          { accountId: sales.id, credit: round2(invoice.total - taxTotal) },
          ...(vat ? [{ accountId: vat.id, credit: taxTotal }] : []),
          { accountId: cogs.id, debit: totalCogs },
          ...Array.from(costByAccount, ([accountId, amount]) => ({ accountId, credit: amount })),
        ],
      });

      if (initialAmount > 0 && initialAccount) {
        await recordInvoicePayment(tx, {
          invoice, amount: initialAmount, account: initialAccount, method: initial.method,
          reference: initial.reference, userId: req.user!.id,
        });
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
    const balance = invoiceBalance(invoice);
    if (amount > balance + 0.01) {
      throw badRequest(`Amount is more than the balance due (${balance.toFixed(2)})`);
    }

    // Validate the receiving account before writing anything.
    const receiveAccount = await resolvePaymentAccount(prisma, companyId, {
      accountId: req.body?.accountId,
      account: req.body?.account,
    });

    await prisma.$transaction((tx) =>
      recordInvoicePayment(tx, {
        invoice, amount, account: receiveAccount, method, reference, notes, userId: req.user!.id,
      })
    );

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
    if ((invoice.creditedAmount ?? 0) > 0) {
      throw badRequest('This invoice has credit notes. Credit the remaining items with a new credit note instead of cancelling it.');
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
      const restoreByAccount = new Map<string, number>();
      const typeOf = new Map(
        (await tx.product.findMany({
          where: { companyId, id: { in: saleMovements.map((m: { productId: string }) => m.productId) } },
          select: { id: true, itemType: true },
        })).map((p: { id: string; itemType: string }) => [p.id, p.itemType])
      );
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
        const stock = await inventoryAccountFor(tx, companyId, typeOf.get(m.productId));
        restoreByAccount.set(stock.id, (restoreByAccount.get(stock.id) ?? 0) + m.totalCost);
        productIds.push(m.productId);
      }
      await syncProductTotals(tx, companyId, productIds);

      // 2. One reversing entry:
      //    Dr Sales Revenue (total) + Dr Inventory (cost restored)
      //    Cr Accounts Receivable (still owed) + Cr Cash/Bank (refund) + Cr COGS (cost)
      const outstanding = Math.max(0, Math.round((invoice.total - invoice.amountPaid) * 100) / 100);
      const refundNow = paid > 0 && refundAccount ? paid : 0;
      const ar = await systemAccount(tx, companyId, 'ar');
      const sales = await systemAccount(tx, companyId, 'sales');
      const cogs = await systemAccount(tx, companyId, 'cogs');
      const taxTotal = round2(invoice.taxTotal ?? 0);
      const vat = taxTotal > 0 ? await systemAccount(tx, companyId, 'vat_payable') : null;
      await postJournal(tx, {
        companyId,
        locationId: invoice.locationId,
        description: `Cancellation of ${invoice.invoiceNumber}`,
        sourceType: 'invoice_cancel',
        sourceId: invoice.id,
        reference: invoice.invoiceNumber,
        createdById: req.user!.id,
        lines: [
          { accountId: sales.id, debit: round2(invoice.total - taxTotal) },
          ...(vat ? [{ accountId: vat.id, debit: taxTotal }] : []),
          ...Array.from(restoreByAccount, ([accountId, amount]) => ({ accountId, debit: amount })),
          { accountId: ar.id, credit: outstanding },
          ...(refundNow > 0 ? [{ accountId: refundAccount.id, credit: refundNow }] : []),
          { accountId: cogs.id, credit: cogsReversed },
        ],
      });

      // 3. Record the refund in the invoice payment history
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
        await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: 0 } });
      }
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- CREDIT NOTES (returns and credits) ----------
router.get('/:id/creditable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await creditableLines(req.user!.companyId, req.params.id) });
  } catch (err) { next(err); }
});

router.post('/:id/credit-notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const note = await createCreditNote(req.user!.companyId, req.params.id, req.user!.id, req.body ?? {});
    res.status(201).json({ success: true, data: note });
  } catch (err: any) {
    if (err?.code === 'P2002') return next(badRequest('Another credit note was saved at the same moment. Please try again.'));
    next(err);
  }
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