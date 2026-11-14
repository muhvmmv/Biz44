import { badRequest } from './errors';
import { systemAccount } from './ledger';

type Tx = any; // Prisma client or interactive-transaction client

/** Accounts that hold money: Cash and bank accounts (subtype cash | bank). */
export function isCashOrBankAccount(account: { type: string; subtype?: string | null; isActive?: boolean }) {
  return (
    account.type === 'asset' &&
    (account.subtype === 'cash' || account.subtype === 'bank') &&
    account.isActive !== false
  );
}

/** All active accounts a payment can be made from or received into. */
export async function listPaymentAccounts(tx: Tx, companyId: string) {
  // Make sure the standard Cash account always exists.
  await systemAccount(tx, companyId, 'cash');
  return tx.account.findMany({
    where: { companyId, type: 'asset', subtype: { in: ['cash', 'bank'] }, isActive: true },
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Resolve the cash/bank account for a payment from request input.
 * Accepts an account ID (preferred) or an existing account's exact name
 * (kept for older clients). Never creates accounts from user input.
 * Defaults to the system Cash account when nothing is given.
 */
export async function resolvePaymentAccount(
  tx: Tx,
  companyId: string,
  input: { accountId?: unknown; account?: unknown }
) {
  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : '';
  const accountName = typeof input.account === 'string' ? input.account.trim() : '';

  let account = null;
  if (accountId) {
    account = await tx.account.findFirst({ where: { id: accountId, companyId } });
  } else if (accountName) {
    account = await tx.account.findFirst({ where: { name: accountName, companyId } });
  } else {
    account = await systemAccount(tx, companyId, 'cash');
  }

  if (!account || !isCashOrBankAccount(account)) {
    throw badRequest('Choose a valid cash or bank account for this payment');
  }
  return account;
}

/** Parse a strictly positive amount from request input, or throw 400. */
export function parsePositiveAmount(value: unknown, label = 'Amount'): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    throw badRequest(`${label} must be a number greater than 0`);
  }
  return Math.round(n * 100) / 100;
}

/** Parse a strictly positive whole-number quantity, or throw 400. */
export function parsePositiveQuantity(value: unknown, label = 'Quantity'): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
    throw badRequest(`${label} must be a whole number greater than 0`);
  }
  return n;
}
