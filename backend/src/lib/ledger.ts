/**
 * Double-entry ledger.
 *
 * Every financial event is ONE JournalEntry whose lines balance:
 * sum(debit) = sum(credit). postJournal() is the only way to write to it.
 *
 * Account.balance is a cache in the account's normal direction (debit-normal
 * for assets and expenses, credit-normal for liabilities, equity, revenue),
 * updated by postJournal() in the same transaction as the entry.
 *
 * Cutover: companies that existed before the ledger have balances built by
 * the old single-entry code. The first time such a company posts, those
 * balances are carried in as one "opening_balance" entry (plugged to Opening
 * Balance Equity), and Company.ledgerStartedAt records the moment. From then
 * on, every balance equals the sum of its journal lines.
 */
import { AppError, badRequest } from './errors';

type Tx = any;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export function isDebitNormal(type: string) {
  return type === 'asset' || type === 'expense';
}

/** Accounts the system posts to, found by key so users can rename them. */
export const SYSTEM_ACCOUNTS = {
  cash: { name: 'Cash', type: 'asset', code: '1000', subtype: 'cash' },
  ar: { name: 'Accounts Receivable', type: 'asset', code: '1100' },
  /** Finished goods (and anything bought to resell). */
  inventory: { name: 'Finished Goods Inventory', type: 'asset', code: '1200' },
  inventory_raw: { name: 'Raw Materials & Packaging', type: 'asset', code: '1210' },
  inventory_wip: { name: 'Work in Progress', type: 'asset', code: '1220' },
  vat_input: { name: 'VAT Recoverable', type: 'asset', code: '1300' },
  ap: { name: 'Accounts Payable', type: 'liability', code: '2000' },
  payroll_liabilities: { name: 'Payroll Deductions Payable', type: 'liability', code: '2100' },
  vat_payable: { name: 'VAT Payable', type: 'liability', code: '2200' },
  opening_equity: { name: 'Opening Balance Equity', type: 'equity', code: '3000' },
  owner_capital: { name: "Owner's Capital", type: 'equity', code: '3100' },
  owner_drawings: { name: "Owner's Drawings", type: 'equity', code: '3200' },
  sales: { name: 'Sales Revenue', type: 'revenue', code: '4000' },
  cogs: { name: 'Cost of Goods Sold', type: 'expense', code: '5000' },
  operating_expenses: { name: 'Operating Expenses', type: 'expense', code: '6000' },
  rent: { name: 'Rent Expense', type: 'expense', code: '6100' },
  utilities: { name: 'Utilities Expense', type: 'expense', code: '6200' },
  salaries: { name: 'Salary Expense', type: 'expense', code: '6300' },
  inventory_loss: { name: 'Inventory Loss', type: 'expense', code: '6800' },
  general_expense: { name: 'General Expense', type: 'expense', code: '6900' },
} as const;

export type SystemKey = keyof typeof SYSTEM_ACCOUNTS;

/** Accounts every new company starts with. */
export const DEFAULT_ACCOUNT_KEYS: SystemKey[] = [
  'cash', 'ar', 'inventory', 'inventory_raw', 'inventory_wip', 'ap', 'payroll_liabilities', 'opening_equity', 'owner_capital', 'owner_drawings',
  'sales', 'cogs', 'operating_expenses', 'rent', 'utilities', 'salaries',
  'inventory_loss', 'general_expense',
];

/** Find (or create) a system account by its key. */
export async function systemAccount(tx: Tx, companyId: string, key: SystemKey) {
  const existing = await tx.account.findFirst({ where: { companyId, systemKey: key } });
  if (existing) return existing;
  const def = SYSTEM_ACCOUNTS[key];
  try {
    return await tx.account.create({
      data: {
        companyId,
        name: def.name,
        type: def.type,
        code: def.code,
        subtype: (def as any).subtype ?? null,
        systemKey: key,
        balance: 0,
      },
    });
  } catch (err: any) {
    // Created concurrently by another request
    if (err?.code === 'P2002') {
      const again = await tx.account.findFirst({ where: { companyId, systemKey: key } });
      if (again) return again;
    }
    throw err;
  }
}

/**
 * Carry a pre-ledger company's balances into the journal, once.
 * Safe to call on every post; it is a no-op after the first time.
 */
export async function ensureLedger(tx: Tx, companyId: string) {
  const company = await tx.company.findUnique({ where: { id: companyId }, select: { ledgerStartedAt: true } });
  if (!company) throw new AppError(404, 'Company not found');
  if (company.ledgerStartedAt) return;

  // Claim the cutover; a concurrent request blocks here and then sees it done.
  const now = new Date();
  const claimed = await tx.company.updateMany({
    where: { id: companyId, ledgerStartedAt: null },
    data: { ledgerStartedAt: now },
  });
  if (claimed.count === 0) return;

  const accounts = await tx.account.findMany({ where: { companyId } });
  const lines: { accountId: string; debit: number; credit: number }[] = [];
  for (const a of accounts) {
    const bal = round2(a.balance);
    if (bal === 0) continue;
    const debitSide = isDebitNormal(a.type) ? bal > 0 : bal < 0;
    lines.push({ accountId: a.id, debit: debitSide ? Math.abs(bal) : 0, credit: debitSide ? 0 : Math.abs(bal) });
  }
  if (lines.length === 0) return;

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  const plug = round2(totalDebit - totalCredit);
  if (plug !== 0) {
    const equity = await systemAccount(tx, companyId, 'opening_equity');
    lines.push({ accountId: equity.id, debit: plug < 0 ? -plug : 0, credit: plug > 0 ? plug : 0 });
    // Opening equity is the only balance that changes: it absorbs the
    // difference left by the old single-entry records. Credit-normal.
    await tx.account.update({ where: { id: equity.id }, data: { balance: { increment: plug } } });
  }

  await tx.journalEntry.create({
    data: {
      companyId,
      date: now,
      description: 'Opening balances carried into the double-entry ledger',
      sourceType: 'opening_balance',
      lines: { create: lines.map((l) => ({ ...l, companyId })) },
    },
  });
}

export interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string | null;
}

export interface JournalInput {
  companyId: string;
  locationId?: string | null;
  date?: Date;
  description: string;
  sourceType: string;
  sourceId?: string | null;
  reference?: string | null;
  createdById?: string | null;
  lines: JournalLineInput[];
}

/**
 * Post one balanced journal entry and update cached account balances.
 * Zero lines are dropped; a negative amount is moved to the other side.
 * Throws if the entry does not balance or uses another company's account.
 */
export async function postJournal(tx: Tx, input: JournalInput) {
  await ensureLedger(tx, input.companyId);

  const lines = input.lines
    .map((l) => {
      let debit = round2(l.debit ?? 0);
      let credit = round2(l.credit ?? 0);
      if (debit < 0) { credit = round2(credit - debit); debit = 0; }
      if (credit < 0) { debit = round2(debit - credit); credit = 0; }
      // A line holds a net amount on one side only.
      const net = round2(debit - credit);
      return { accountId: l.accountId, memo: l.memo ?? null, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    })
    .filter((l) => l.debit !== 0 || l.credit !== 0);

  if (lines.length === 0) return null;

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    // A programming error, never user input — refuse to write an unbalanced entry.
    throw new AppError(500, `Unbalanced journal entry "${input.description}": debits ${totalDebit} ≠ credits ${totalCredit}`);
  }

  const accountIds = Array.from(new Set(lines.map((l) => l.accountId)));
  const accounts = await tx.account.findMany({
    where: { id: { in: accountIds }, companyId: input.companyId },
    select: { id: true, type: true },
  });
  if (accounts.length !== accountIds.length) throw badRequest('Account not found');
  const typeOf = new Map<string, string>(accounts.map((a: any) => [a.id, a.type]));

  const entry = await tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      locationId: input.locationId ?? null,
      date: input.date ?? new Date(),
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      reference: input.reference ?? null,
      createdById: input.createdById ?? null,
      lines: { create: lines.map((l) => ({ ...l, companyId: input.companyId })) },
    },
  });

  const netByAccount = new Map<string, number>();
  for (const l of lines) netByAccount.set(l.accountId, round2((netByAccount.get(l.accountId) ?? 0) + l.debit - l.credit));
  for (const [accountId, net] of netByAccount) {
    if (net === 0) continue;
    const change = isDebitNormal(typeOf.get(accountId)!) ? net : -net;
    await tx.account.update({ where: { id: accountId }, data: { balance: { increment: change } } });
  }

  return entry;
}

/**
 * Check the ledger: every entry balances, and every cached account balance
 * equals the sum of its journal lines. Returns the problems found.
 */
export async function verifyLedger(tx: Tx, companyId: string) {
  const [accounts, sums, unbalanced, company] = await Promise.all([
    tx.account.findMany({ where: { companyId } }),
    tx.journalLine.groupBy({ by: ['accountId'], where: { companyId }, _sum: { debit: true, credit: true } }),
    tx.$queryRaw<{ id: string; description: string; diff: number }[]>`
      SELECT e.id, e.description, (SUM(l.debit) - SUM(l.credit))::float AS diff
      FROM journal_entries e JOIN journal_lines l ON l."entryId" = e.id
      WHERE e."companyId" = ${companyId}
      GROUP BY e.id, e.description
      HAVING SUM(l.debit) <> SUM(l.credit)`,
    tx.company.findUnique({ where: { id: companyId }, select: { ledgerStartedAt: true } }),
  ]);
  const sumOf = new Map<string, number>(
    sums.map((s: any) => [s.accountId, round2(Number(s._sum.debit ?? 0) - Number(s._sum.credit ?? 0))])
  );
  const mismatches = [];
  if (company?.ledgerStartedAt) {
    for (const a of accounts) {
      const net = sumOf.get(a.id) ?? 0;
      const fromJournal = isDebitNormal(a.type) ? net : -net;
      if (Math.abs(round2(a.balance) - fromJournal) > 0.01) {
        mismatches.push({ accountId: a.id, name: a.name, cached: round2(a.balance), journal: round2(fromJournal) });
      }
    }
  }
  const totalDebitMinusCredit = round2(Array.from(sumOf.values()).reduce((s, v) => s + v, 0));
  return {
    ledgerStartedAt: company?.ledgerStartedAt ?? null,
    balanced: unbalanced.length === 0 && Math.abs(totalDebitMinusCredit) < 0.01,
    unbalancedEntries: unbalanced,
    balanceMismatches: mismatches,
  };
}
