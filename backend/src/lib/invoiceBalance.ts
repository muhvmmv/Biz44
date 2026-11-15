import { round2 } from './ledger';

/** What the customer still owes on an invoice: total less payments and credit notes. */
export function invoiceBalance(inv: { total: number; amountPaid: number; creditedAmount?: number | null }) {
  return round2(inv.total - inv.amountPaid - (inv.creditedAmount ?? 0));
}
