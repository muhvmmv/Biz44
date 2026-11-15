import { prisma } from './prisma';
import { notFound } from './errors';
import { round2 } from './ledger';
import { purchaseBalance } from '../modules/purchases/purchase.service';
import { invoiceBalance } from './invoiceBalance';

/**
 * Customer and supplier statements, built from the documents themselves so
 * they include records from before the ledger started.
 *
 * A line's `amount` is the change in what is owed: positive for an invoice or
 * purchase (or a refund), negative for a payment, return or cancellation.
 */
export interface StatementLine {
  date: Date;
  type: 'invoice' | 'payment' | 'refund' | 'cancellation' | 'credit' | 'deposit' | 'deposit_refund' | 'purchase' | 'return';
  reference: string | null;
  description: string;
  documentId: string | null;
  amount: number;
  balance: number;
}

export interface Aging { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; total: number }

function emptyAging(): Aging {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
}

/** Put an amount into its aging bucket by days past the due date. */
function addToAging(aging: Aging, amount: number, due: Date, now: Date) {
  const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
  if (days <= 0) aging.current += amount;
  else if (days <= 30) aging.d1_30 += amount;
  else if (days <= 60) aging.d31_60 += amount;
  else if (days <= 90) aging.d61_90 += amount;
  else aging.d90plus += amount;
  aging.total += amount;
}

function roundAging(a: Aging): Aging {
  return {
    current: round2(a.current), d1_30: round2(a.d1_30), d31_60: round2(a.d31_60),
    d61_90: round2(a.d61_90), d90plus: round2(a.d90plus), total: round2(a.total),
  };
}

/** Order events, split them into opening balance and period lines, and run the balance. */
function runStatement(events: Omit<StatementLine, 'balance'>[], from?: Date, to?: Date) {
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  let opening = 0;
  let balance = 0;
  const lines: StatementLine[] = [];
  let increases = 0;
  let decreases = 0;
  for (const e of events) {
    if (to && e.date > to) continue;
    if (from && e.date < from) {
      opening += e.amount;
      balance = opening;
      continue;
    }
    balance += e.amount;
    if (e.amount >= 0) increases += e.amount; else decreases -= e.amount;
    lines.push({ ...e, amount: round2(e.amount), balance: round2(balance) });
  }
  return {
    openingBalance: round2(opening),
    lines,
    totals: { increases: round2(increases), decreases: round2(decreases) },
    closingBalance: round2(balance),
  };
}

async function cancellationDates(companyId: string, sourceType: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, Date>();
  const entries = await prisma.journalEntry.findMany({
    where: { companyId, sourceType, sourceId: { in: ids } },
    select: { sourceId: true, date: true },
  });
  return new Map(entries.map((e) => [e.sourceId as string, e.date]));
}

export async function customerStatement(companyId: string, customerId: string, from?: Date, to?: Date) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId } });
  if (!customer) throw notFound('Customer not found');

  const invoices = await prisma.invoice.findMany({
    where: { companyId, customerId, finalizedAt: { not: null } },
    include: { payments: true, creditNotes: true },
  });
  const cancelled = invoices.filter((i) => i.status === 'cancelled');
  const cancelDates = await cancellationDates(companyId, 'invoice_cancel', cancelled.map((i) => i.id));

  const events: Omit<StatementLine, 'balance'>[] = [];
  for (const inv of invoices) {
    events.push({
      date: inv.finalizedAt as Date, type: 'invoice', reference: inv.invoiceNumber,
      description: `Invoice ${inv.invoiceNumber}`, documentId: inv.id, amount: inv.total,
    });
    for (const p of inv.payments) {
      // A deposit applied to the invoice was already counted when it was received.
      if (p.depositId) continue;
      const refund = p.amount < 0;
      events.push({
        date: p.paidAt, type: refund ? 'refund' : 'payment', reference: p.reference || inv.invoiceNumber,
        description: refund ? `Refund on ${inv.invoiceNumber}` : `Payment for ${inv.invoiceNumber}${p.method ? ` (${p.method.replace('_', ' ')})` : ''}`,
        documentId: inv.id, amount: -p.amount,
      });
    }
    for (const cn of inv.creditNotes) {
      events.push({
        date: cn.createdAt, type: 'credit', reference: cn.number,
        description: `Credit note ${cn.number} on ${inv.invoiceNumber}${cn.reason ? ` (${cn.reason})` : ''}`,
        documentId: inv.id, amount: -cn.total,
      });
    }
    if (inv.status === 'cancelled') {
      events.push({
        date: cancelDates.get(inv.id) ?? inv.updatedAt, type: 'cancellation', reference: inv.invoiceNumber,
        description: `Invoice ${inv.invoiceNumber} cancelled`, documentId: inv.id, amount: -inv.total,
      });
    }
  }

  // Deposits received (e.g. on production orders) reduce what the customer
  // owes as soon as they are paid; refunds of them add it back.
  const deposits = await prisma.customerDeposit.findMany({ where: { companyId, customerId } });
  const refundDates = await cancellationDates(companyId, 'deposit_refund', deposits.filter((d) => d.refundedAmount > 0).map((d) => d.id));
  for (const d of deposits) {
    events.push({ date: d.receivedAt, type: 'deposit', reference: d.number, description: `Deposit ${d.number}${d.reference ? ` (${d.reference})` : ''}`, documentId: null, amount: -d.amount });
    if (d.refundedAmount > 0) {
      events.push({ date: refundDates.get(d.id) ?? d.createdAt, type: 'deposit_refund', reference: d.number, description: `Refund of deposit ${d.number}`, documentId: null, amount: d.refundedAmount });
    }
  }

  const now = new Date();
  const aging = emptyAging();
  const open = invoices
    .filter((i) => i.status !== 'cancelled' && invoiceBalance(i) > 0)
    .map((i) => {
      const due = i.dueDate ?? (i.finalizedAt as Date);
      const balance = invoiceBalance(i);
      addToAging(aging, balance, due, now);
      return {
        id: i.id, reference: i.invoiceNumber, date: i.finalizedAt, dueDate: i.dueDate,
        total: i.total, paid: i.amountPaid, balance,
        daysOverdue: Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000)),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    party: {
      id: customer.id, name: `${customer.firstName} ${customer.lastName}`.trim(),
      email: customer.email, phone: customer.phone, address: customer.address,
    },
    from: from ?? null,
    to: to ?? null,
    ...runStatement(events, from, to),
    aging: roundAging(aging),
    openDocuments: open,
  };
}

export async function supplierStatement(companyId: string, supplierId: string, from?: Date, to?: Date) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, companyId } });
  if (!supplier) throw notFound('Supplier not found');

  const purchases = await prisma.purchase.findMany({
    where: { companyId, supplierId },
    include: { payments: true },
  });
  const returns = purchases.length
    ? await prisma.journalEntry.findMany({
        where: { companyId, sourceType: 'supplier_return', sourceId: { in: purchases.map((p) => p.id) } },
        include: { lines: { select: { debit: true } } },
      })
    : [];
  const returnsByPurchase = new Map<string, typeof returns>();
  for (const r of returns) {
    const list = returnsByPurchase.get(r.sourceId as string) ?? [];
    list.push(r);
    returnsByPurchase.set(r.sourceId as string, list);
  }

  const events: Omit<StatementLine, 'balance'>[] = [];
  for (const p of purchases) {
    const ref = p.reference || `Purchase ${p.date.toISOString().slice(0, 10)}`;
    events.push({ date: p.date, type: 'purchase', reference: p.reference, description: `Goods received${p.reference ? ` (${p.reference})` : ''}`, documentId: p.id, amount: p.total });
    for (const pay of p.payments) {
      const refund = pay.amount < 0;
      events.push({
        date: pay.paidAt, type: refund ? 'refund' : 'payment', reference: pay.reference || p.reference,
        description: refund ? `Refund from supplier for ${ref}` : `Payment for ${ref} (${pay.account})`,
        documentId: p.id, amount: -pay.amount,
      });
    }
    // Returns: value of goods sent back = all the debits of the return entry
    // (owed reduced + refund). Returns made before the ledger have no entry,
    // so fall back to the stored returned amount.
    const entries = returnsByPurchase.get(p.id) ?? [];
    let recorded = 0;
    for (const e of entries) {
      const value = round2(e.lines.reduce((s, l) => s + Number(l.debit), 0));
      recorded += value;
      events.push({ date: e.date, type: 'return', reference: e.reference, description: e.description, documentId: p.id, amount: -value });
    }
    const unrecorded = round2((p.returnedAmount ?? 0) - recorded);
    if (unrecorded > 0.009) {
      events.push({ date: p.updatedAt, type: 'return', reference: p.reference, description: `Goods returned (${ref})`, documentId: p.id, amount: -unrecorded });
    }
  }

  const now = new Date();
  const aging = emptyAging();
  const open = purchases
    .map((p) => ({ p, balance: purchaseBalance(p) }))
    .filter(({ balance }) => balance > 0)
    .map(({ p, balance }) => {
      const due = p.dueDate ?? p.date;
      addToAging(aging, balance, due, now);
      return {
        id: p.id, reference: p.reference, date: p.date, dueDate: p.dueDate,
        total: p.total, paid: p.amountPaid, balance,
        daysOverdue: Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000)),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    party: { id: supplier.id, name: supplier.name, email: supplier.email, phone: supplier.phone, address: supplier.address },
    from: from ?? null,
    to: to ?? null,
    ...runStatement(events, from, to),
    aging: roundAging(aging),
    openDocuments: open,
  };
}
