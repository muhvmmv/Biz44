import { prisma } from './prisma';
import { AppError, badRequest, notFound } from './errors';
import { parsePositiveAmount, resolvePaymentAccount } from './accounts';
import { postJournal, round2, systemAccount } from './ledger';
import { invoiceBalance } from './invoiceBalance';

/**
 * Customer deposits: money received before the customer is invoiced, e.g. a
 * deposit (or full payment) on a production order made for them.
 *
 *   received  Dr Cash/Bank        / Cr Customer Deposits (liability)
 *   applied   Dr Customer Deposits / Cr Accounts Receivable  (as a "deposit" payment on the invoice)
 *   refunded  Dr Customer Deposits / Cr Cash/Bank
 *
 * available = amount - appliedAmount - refundedAmount
 */
type Tx = any;

export const depositAvailable = (d: { amount: number; appliedAmount: number; refundedAmount: number }) =>
  round2(d.amount - d.appliedAmount - d.refundedAmount);

export function withAvailable<T extends { amount: number; appliedAmount: number; refundedAmount: number }>(d: T) {
  return { ...d, available: depositAvailable(d) };
}

async function nextNumber(tx: Tx, companyId: string) {
  const last = await tx.customerDeposit.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { number: true } });
  const n = last ? parseInt(last.number.replace(/\D/g, ''), 10) || 0 : 0;
  return `DEP-${String(n + 1).padStart(4, '0')}`;
}

export interface DepositInput {
  customerId?: unknown;
  productionOrderId?: unknown;
  amount?: unknown;
  accountId?: unknown;
  method?: unknown;
  reference?: unknown;
  notes?: unknown;
  date?: unknown;
}

/** Check everything a deposit needs before anything is written. */
export async function prepareDeposit(companyId: string, input: DepositInput) {
  const amount = parsePositiveAmount(input.amount, 'Deposit amount');
  const account = await resolvePaymentAccount(prisma, companyId, { accountId: input.accountId });
  let order: any = null;
  if (input.productionOrderId) {
    order = await prisma.productionOrder.findFirst({ where: { id: String(input.productionOrderId), companyId } });
    if (!order) throw notFound('Production order not found');
    if (order.status === 'cancelled') throw badRequest('This production order is cancelled');
  }
  const customerId = String(input.customerId ?? order?.customerId ?? '');
  if (!customerId) throw badRequest('Choose the customer the deposit is from');
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
  if (!customer) throw notFound('Customer not found');
  if (order && order.customerId && order.customerId !== customerId) throw badRequest('This production order is for a different customer');
  let receivedAt: Date | undefined;
  if (typeof input.date === 'string' && input.date) {
    receivedAt = new Date(input.date);
    if (isNaN(receivedAt.getTime())) throw badRequest('Invalid date');
  }
  return {
    amount, account, order, customerId, receivedAt,
    method: typeof input.method === 'string' && input.method ? input.method : 'cash',
    reference: typeof input.reference === 'string' && input.reference.trim() ? input.reference.trim().slice(0, 100) : null,
    notes: typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 300) : null,
  };
}

export async function recordDeposit(
  tx: Tx,
  companyId: string,
  userId: string,
  locationId: string | null,
  d: Awaited<ReturnType<typeof prepareDeposit>>
) {
  const number = await nextNumber(tx, companyId);
  const deposit = await tx.customerDeposit.create({
    data: {
      companyId, locationId: d.order?.locationId ?? locationId, customerId: d.customerId, productionOrderId: d.order?.id ?? null,
      number, amount: d.amount, method: d.method, accountName: d.account.name, reference: d.reference, notes: d.notes,
      ...(d.receivedAt && { receivedAt: d.receivedAt }), createdById: userId,
    },
  });
  const liability = await systemAccount(tx, companyId, 'customer_deposits');
  await postJournal(tx, {
    companyId,
    locationId: deposit.locationId,
    description: `Deposit ${number}${d.order ? ` on ${d.order.number}` : ''}`,
    sourceType: 'deposit',
    sourceId: deposit.id,
    reference: d.reference ?? number,
    date: deposit.receivedAt,
    createdById: userId,
    lines: [
      { accountId: d.account.id, debit: d.amount },
      { accountId: liability.id, credit: d.amount },
    ],
  });
  return deposit;
}

/** Use up to `max` of a deposit to pay an invoice. Returns the amount applied. */
export async function applyDeposit(tx: Tx, args: { deposit: any; invoice: any; max?: number; userId: string }) {
  const { invoice } = args;
  // Lock the deposit so it cannot be used twice at once.
  await tx.$executeRaw`SELECT id FROM customer_deposits WHERE id = ${args.deposit.id} FOR UPDATE`;
  const deposit = await tx.customerDeposit.findUnique({ where: { id: args.deposit.id } });
  const current = await tx.invoice.findUnique({ where: { id: invoice.id } });
  const owed = Math.max(0, invoiceBalance(current));
  const amount = round2(Math.min(depositAvailable(deposit), owed, args.max ?? Infinity));
  if (!(amount > 0)) return 0;

  await tx.customerDeposit.update({ where: { id: deposit.id }, data: { appliedAmount: round2(deposit.appliedAmount + amount) } });
  await tx.payment.create({
    data: {
      companyId: current.companyId, locationId: current.locationId, invoiceId: current.id, depositId: deposit.id,
      amount, method: 'deposit', reference: deposit.number, notes: `Deposit ${deposit.number} applied`,
    },
  });
  const amountPaid = round2(current.amountPaid + amount);
  const left = invoiceBalance({ ...current, amountPaid });
  await tx.invoice.update({ where: { id: current.id }, data: { amountPaid, status: left <= 0.01 ? 'paid' : 'partially_paid' } });
  const liability = await systemAccount(tx, current.companyId, 'customer_deposits');
  const ar = await systemAccount(tx, current.companyId, 'ar');
  await postJournal(tx, {
    companyId: current.companyId,
    locationId: current.locationId,
    description: `Deposit ${deposit.number} applied to ${current.invoiceNumber}`,
    sourceType: 'deposit_applied',
    sourceId: deposit.id,
    reference: current.invoiceNumber,
    createdById: args.userId,
    lines: [
      { accountId: liability.id, debit: amount },
      { accountId: ar.id, credit: amount },
    ],
  });
  return amount;
}

/** Apply every unused deposit taken on a production order to its invoice, oldest first. */
export async function applyOrderDeposits(tx: Tx, invoice: any, userId: string) {
  if (!invoice.productionOrderId) return 0;
  const deposits = await tx.customerDeposit.findMany({
    where: { companyId: invoice.companyId, productionOrderId: invoice.productionOrderId },
    orderBy: { receivedAt: 'asc' },
  });
  let total = 0;
  for (const d of deposits) {
    if (depositAvailable(d) <= 0) continue;
    total += await applyDeposit(tx, { deposit: d, invoice, userId });
  }
  return round2(total);
}

export async function refundDeposit(companyId: string, depositId: string, userId: string, body: { amount?: unknown; accountId?: unknown; reference?: unknown }) {
  const deposit = await prisma.customerDeposit.findFirst({ where: { id: depositId, companyId } });
  if (!deposit) throw notFound('Deposit not found');
  const account = await resolvePaymentAccount(prisma, companyId, { accountId: body.accountId });
  return prisma.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT id FROM customer_deposits WHERE id = ${deposit.id} FOR UPDATE`;
    const d = await tx.customerDeposit.findUnique({ where: { id: deposit.id } });
    const available = depositAvailable(d);
    const amount = body.amount === undefined || body.amount === '' ? available : parsePositiveAmount(body.amount, 'Refund amount');
    if (!(amount > 0)) throw badRequest('Nothing is left on this deposit to refund');
    if (amount > available + 0.01) throw new AppError(400, `Only ${available.toFixed(2)} of this deposit is unused`);
    await tx.customerDeposit.update({ where: { id: d.id }, data: { refundedAmount: round2(d.refundedAmount + amount) } });
    const liability = await systemAccount(tx, companyId, 'customer_deposits');
    await postJournal(tx, {
      companyId,
      locationId: d.locationId,
      description: `Refund of deposit ${d.number}`,
      sourceType: 'deposit_refund',
      sourceId: d.id,
      reference: typeof body.reference === 'string' && body.reference ? body.reference : d.number,
      createdById: userId,
      lines: [
        { accountId: liability.id, debit: amount },
        { accountId: account.id, credit: amount },
      ],
    });
    return withAvailable(await tx.customerDeposit.findUnique({ where: { id: d.id } }));
  });
}
