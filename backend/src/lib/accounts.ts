import { badRequest } from './errors';

type Tx = any; // Prisma client or interactive-transaction client

/**
 * Asset accounts that are NOT places money is held. Everything else of
 * type "asset" (Cash, Bank Account, Bank Account 2, ...) is a valid account
 * to receive money into or pay money out of.
 */
const NON_CASH_ASSETS = new Set(['Accounts Receivable', 'Inventory']);

export function isCashOrBankAccount(account: { type: string; name: string }) {
  return account.type === 'asset' && !NON_CASH_ASSETS.has(account.name);
}

/**
 * Find a system account by its fixed name, creating it if it is missing.
 * Only call this with names hard-coded in the backend, never with user input.
 */
export async function findOrCreateAccount(tx: Tx, companyId: string, name: string, type: string) {
  const existing = await tx.account.findFirst({ where: { companyId, name } });
  if (existing) return existing;
  return tx.account.create({ data: { companyId, name, type, balance: 0 } });
}

/** All accounts a payment can be made from or received into. */
export async function listPaymentAccounts(tx: Tx, companyId: string) {
  // Make sure the standard Cash account always exists.
  await findOrCreateAccount(tx, companyId, 'Cash', 'asset');
  const assets = await tx.account.findMany({
    where: { companyId, type: 'asset' },
    orderBy: { name: 'asc' },
  });
  return assets.filter(isCashOrBankAccount);
}

/**
 * Resolve the cash/bank account for a payment from request input.
 * Accepts an account ID (preferred) or an existing account's exact name
 * (kept for older clients). Never creates accounts from user input.
 * Defaults to "Cash" when nothing is given.
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
    account = await findOrCreateAccount(tx, companyId, 'Cash', 'asset');
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
