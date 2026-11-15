import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { parsePositiveQuantity, resolvePaymentAccount, roundQty } from '../../lib/accounts';
import { postJournal, round2, systemAccount } from '../../lib/ledger';
import { addStock, inventoryAccountFor, restoreToBatch, syncProductTotals } from '../../lib/inventory';
import { invoiceBalance } from '../../lib/invoiceBalance';

/**
 * Credit notes: goods returned by a customer, or a credit for part of an
 * invoice. The invoice is never edited. A credit note:
 *  - values each line at the invoice's price after its discount, plus VAT at
 *    the invoice's rate;
 *  - first reduces what the customer still owes, and refunds the rest from a
 *    chosen cash or bank account (a negative payment, as for cancellations);
 *  - puts restocked goods back into the batches they were sold from, at their
 *    original cost (damaged goods can be credited without restocking);
 *  - posts one balanced entry: Dr Sales, Dr VAT Payable, Dr Inventory (cost
 *    back) / Cr Receivables, Cr Cash/Bank (refund), Cr COGS (cost back).
 */
export interface CreditNoteInput {
  items?: { invoiceItemId?: unknown; quantity?: unknown; restock?: unknown }[];
  reason?: unknown;
  refundAccountId?: unknown;
  refundMethod?: unknown;
}

async function nextNumber(tx: any, companyId: string) {
  const last = await tx.creditNote.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { number: true } });
  const n = last ? parseInt(last.number.replace(/\D/g, ''), 10) || 0 : 0;
  return `CN-${String(n + 1).padStart(4, '0')}`;
}

/** Quantity of each invoice line already credited. */
async function creditedByItem(tx: any, invoiceId: string) {
  const lines = await tx.creditNoteLine.findMany({ where: { creditNote: { invoiceId } }, select: { invoiceItemId: true, quantity: true } });
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.invoiceItemId, roundQty((map.get(l.invoiceItemId) ?? 0) + l.quantity));
  return map;
}

/** What can still be credited on each line of an invoice (for the app's return form). */
export async function creditableLines(companyId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, include: { items: { include: { product: { select: { unit: true } } } } } });
  if (!invoice) throw notFound('Invoice not found');
  const credited = await creditedByItem(prisma, invoice.id);
  const share = invoice.subtotal > 0 ? 1 - invoice.discountTotal / invoice.subtotal : 1;
  return invoice.items.map((it) => ({
    invoiceItemId: it.id,
    productId: it.productId,
    description: it.description,
    unit: it.product?.unit ?? null,
    sold: it.quantity,
    credited: credited.get(it.id) ?? 0,
    available: roundQty(it.quantity - (credited.get(it.id) ?? 0)),
    unitPrice: round2(it.unitPrice * share),
    taxRate: invoice.taxRate,
  }));
}

export async function createCreditNote(companyId: string, invoiceId: string, userId: string, body: CreditNoteInput) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, include: { items: true } });
  if (!invoice) throw notFound('Invoice not found');
  if (!invoice.finalizedAt || invoice.status === 'draft') throw badRequest('Only a finalized invoice can be credited. Edit or delete the draft instead.');
  if (invoice.status === 'cancelled') throw badRequest('This invoice is cancelled');

  const raw = Array.isArray(body.items) ? body.items : [];
  const requested = new Map<string, { quantity: number; restock: boolean }>();
  raw.forEach((it, i) => {
    const id = String(it?.invoiceItemId ?? '');
    if (!id) return;
    const quantity = it?.quantity === undefined || it?.quantity === '' || Number(it?.quantity) === 0 ? 0 : parsePositiveQuantity(it.quantity, `Line ${i + 1} quantity`);
    if (quantity > 0) requested.set(id, { quantity: roundQty((requested.get(id)?.quantity ?? 0) + quantity), restock: it?.restock !== false });
  });
  if (requested.size === 0) throw badRequest('Enter how many of at least one item are being returned or credited');
  for (const id of requested.keys()) {
    if (!invoice.items.some((it) => it.id === id)) throw badRequest('An item is not on this invoice');
  }
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;
  const share = invoice.subtotal > 0 ? 1 - invoice.discountTotal / invoice.subtotal : 1;

  // Validate the refund account (if one is given) before writing anything.
  const refundAccount = body.refundAccountId
    ? await resolvePaymentAccount(prisma, companyId, { accountId: body.refundAccountId })
    : null;

  return prisma.$transaction(async (tx) => {
    // Lock the invoice row so two credit notes cannot over-credit it.
    await tx.$executeRaw`SELECT id FROM invoices WHERE id = ${invoice.id} FOR UPDATE`;
    const current = await tx.invoice.findUnique({ where: { id: invoice.id } });
    if (!current || current.status === 'cancelled') throw badRequest('This invoice is cancelled');
    const credited = await creditedByItem(tx, invoice.id);

    const number = await nextNumber(tx, companyId);
    const lines: { item: (typeof invoice.items)[number]; quantity: number; unitPrice: number; total: number; restocked: boolean; cost: number }[] = [];
    for (const item of invoice.items) {
      const req = requested.get(item.id);
      if (!req) continue;
      const left = roundQty(item.quantity - (credited.get(item.id) ?? 0));
      if (req.quantity > left + 0.00001) {
        throw badRequest(`Only ${left} of "${item.description}" can still be credited (${item.quantity} sold)`);
      }
      const unitPrice = item.unitPrice * share;
      lines.push({ item, quantity: req.quantity, unitPrice, total: round2(req.quantity * unitPrice), restocked: !!item.productId && req.restock, cost: 0 });
    }

    const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
    const taxTotal = round2((subtotal * (current.taxRate ?? 0)) / 100);
    const total = round2(subtotal + taxTotal);
    const owed = Math.max(0, invoiceBalance(current));
    const appliedAmount = round2(Math.min(total, owed));
    const refundAmount = round2(total - appliedAmount);
    if (refundAmount > 0.009 && !refundAccount) {
      throw badRequest(
        `The customer has already paid for these goods, so ${refundAmount.toFixed(2)} is due back to them. ` +
          'Choose the cash or bank account the refund is paid from.'
      );
    }

    // Stock back into the batches it was sold from, most recently used first.
    const costByAccount = new Map<string, number>();
    const productIds: string[] = [];
    for (const line of lines) {
      if (!line.restocked) continue;
      const productId = line.item.productId!;
      const product = await tx.product.findFirst({ where: { id: productId, companyId }, select: { itemType: true } });
      if (!product) throw notFound(`"${line.item.description}" no longer exists as a product`);
      const sold = await tx.stockMovement.findMany({
        where: { companyId, productId, reference: invoice.invoiceNumber, type: 'sale' },
        orderBy: { createdAt: 'desc' },
      });
      const returned = await tx.stockMovement.findMany({
        where: { companyId, productId, reference: invoice.invoiceNumber, type: 'return' },
        select: { batchId: true, quantity: true },
      });
      const returnedByBatch = new Map<string, number>();
      for (const r of returned) if (r.batchId) returnedByBatch.set(r.batchId, (returnedByBatch.get(r.batchId) ?? 0) + r.quantity);

      let remaining = line.quantity;
      for (const m of sold) {
        if (remaining <= 0.00001) break;
        if (m.batchId) {
          const room = roundQty(Math.abs(m.quantity) - (returnedByBatch.get(m.batchId) ?? 0));
          if (room <= 0) continue;
          const take = roundQty(Math.min(room, remaining));
          const { cost } = await restoreToBatch(tx, {
            companyId, batchId: m.batchId, quantity: take, type: 'return',
            reference: invoice.invoiceNumber, notes: `Credit note ${number}`,
          });
          returnedByBatch.set(m.batchId, (returnedByBatch.get(m.batchId) ?? 0) + take);
          line.cost += cost;
          remaining = roundQty(remaining - take);
        }
      }
      if (remaining > 0.00001) {
        // Sold before stock batches existed: return as a new layer at the sale's average cost.
        const legacy = sold.find((m) => !m.batchId) ?? sold[0];
        const unitCost = legacy ? legacy.unitCost : 0;
        await addStock(tx, {
          companyId, locationId: current.locationId, productId, quantity: remaining, unitCost,
          type: 'return', reference: invoice.invoiceNumber, notes: `Credit note ${number}`,
        });
        line.cost += round2(remaining * unitCost);
      }
      line.cost = round2(line.cost);
      const stock = await inventoryAccountFor(tx, companyId, product.itemType);
      costByAccount.set(stock.id, round2((costByAccount.get(stock.id) ?? 0) + line.cost));
      productIds.push(productId);
    }
    if (productIds.length) await syncProductTotals(tx, companyId, productIds);
    const costReturned = round2(lines.reduce((s, l) => s + l.cost, 0));

    const note = await tx.creditNote.create({
      data: {
        companyId, locationId: current.locationId, invoiceId: invoice.id, number, reason,
        subtotal, taxTotal, total, appliedAmount, refundAmount,
        refundAccountName: refundAmount > 0 ? refundAccount!.name : null,
        costReturned, createdById: userId,
        lines: {
          create: lines.map((l) => ({
            invoiceItemId: l.item.id, productId: l.item.productId, description: l.item.description,
            quantity: l.quantity, unitPrice: round2(l.unitPrice), total: l.total, restocked: l.restocked, cost: l.cost,
          })),
        },
      },
      include: { lines: true },
    });

    if (refundAmount > 0) {
      await tx.payment.create({
        data: {
          companyId, locationId: current.locationId, invoiceId: invoice.id, amount: -refundAmount,
          method: typeof body.refundMethod === 'string' && body.refundMethod ? body.refundMethod : 'refund',
          reference: number, notes: `Refund on credit note ${number} (${refundAccount!.name})`,
        },
      });
    }
    const amountPaid = round2(current.amountPaid - refundAmount);
    const creditedAmount = round2((current.creditedAmount ?? 0) + total);
    const left = invoiceBalance({ total: current.total, amountPaid, creditedAmount });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid, creditedAmount,
        // Settled once nothing is left to collect; otherwise keep its open status.
        status: left <= 0.01 ? 'paid' : amountPaid > 0 ? 'partially_paid' : current.status === 'paid' ? 'unpaid' : current.status,
      },
    });

    const sales = await systemAccount(tx, companyId, 'sales');
    const ar = await systemAccount(tx, companyId, 'ar');
    const cogs = await systemAccount(tx, companyId, 'cogs');
    const vat = taxTotal > 0 ? await systemAccount(tx, companyId, 'vat_payable') : null;
    await postJournal(tx, {
      companyId,
      locationId: current.locationId,
      description: `Credit note ${number} for ${invoice.invoiceNumber}${reason ? `: ${reason}` : ''}`,
      sourceType: 'credit_note',
      sourceId: note.id,
      reference: number,
      createdById: userId,
      lines: [
        { accountId: sales.id, debit: subtotal },
        ...(vat ? [{ accountId: vat.id, debit: taxTotal }] : []),
        ...(appliedAmount > 0 ? [{ accountId: ar.id, credit: appliedAmount }] : []),
        ...(refundAmount > 0 ? [{ accountId: refundAccount!.id, credit: refundAmount }] : []),
        ...Array.from(costByAccount, ([accountId, amount]) => ({ accountId, debit: amount })),
        ...(costReturned > 0 ? [{ accountId: cogs.id, credit: costReturned }] : []),
      ],
    });
    return note;
  });
}
