/**
 * Financial reporting — the single source for every money figure shown in
 * Biz44 (dashboard, P&L, balance sheet, cash flow, reports).
 *
 * Data:
 *  - Journal lines (double-entry) from the moment the company's ledger
 *    started (Company.ledgerStartedAt).
 *  - For profit & loss periods BEFORE that moment, the older single-entry
 *    Transaction rows on revenue and expense accounts, taken by account (so
 *    old cancellations, which were posted as negative amounts on the same
 *    accounts, net out too).
 *
 * Revenue is recognised when an invoice is finalized and reversed when it is
 * cancelled (accrual basis). Customer payments never count as revenue.
 */
import { prisma } from './prisma';
import { isDebitNormal, round2 } from './ledger';

export interface Period {
  from?: Date;
  to?: Date;
  /** Restrict to these locations (entries with no location are excluded). Omit for the whole company. */
  locationIds?: string[];
}

type Activity = Map<string, number>; // accountId -> net amount in the account's normal direction

async function companyContext(companyId: string) {
  const [company, accounts] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { ledgerStartedAt: true } }),
    prisma.account.findMany({ where: { companyId } }),
  ]);
  return { ledgerStartedAt: company?.ledgerStartedAt ?? null, accounts };
}

function dateFilter(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

/** Net journal activity per account in a period, in each account's normal direction. */
async function journalActivity(
  companyId: string,
  accounts: { id: string; type: string }[],
  p: Period & { includeOpening?: boolean }
): Promise<Activity> {
  const entryWhere: any = {};
  const date = dateFilter(p.from, p.to);
  if (date) entryWhere.date = date;
  if (p.locationIds) entryWhere.locationId = { in: p.locationIds };
  if (!p.includeOpening) entryWhere.sourceType = { not: 'opening_balance' };

  const rows = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: { companyId, entry: entryWhere },
    _sum: { debit: true, credit: true },
  });
  const typeOf = new Map(accounts.map((a) => [a.id, a.type]));
  const out: Activity = new Map();
  for (const r of rows) {
    const net = Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0);
    const type = typeOf.get(r.accountId) ?? 'asset';
    out.set(r.accountId, round2(isDebitNormal(type) ? net : -net));
  }
  return out;
}

/** Older single-entry P&L records (revenue/expense accounts) before the ledger started. */
async function legacyPnlActivity(
  companyId: string,
  ledgerStartedAt: Date | null,
  accounts: { id: string; type: string }[],
  p: Period
): Promise<Activity> {
  const pnlIds = accounts.filter((a) => a.type === 'revenue' || a.type === 'expense').map((a) => a.id);
  if (pnlIds.length === 0) return new Map();
  let to = p.to;
  if (ledgerStartedAt && (!to || to >= ledgerStartedAt)) to = new Date(ledgerStartedAt.getTime() - 1);
  if (p.from && to && to < p.from) return new Map();

  const where: any = { companyId, accountId: { in: pnlIds } };
  const date = dateFilter(p.from, to);
  if (date) where.date = date;
  if (p.locationIds) where.locationId = { in: p.locationIds };

  const rows = await prisma.transaction.groupBy({ by: ['accountId'], where, _sum: { amount: true } });
  // Old rows store amounts in the account's normal direction (sales +, refunds -).
  return new Map(rows.map((r) => [r.accountId, round2(r._sum.amount ?? 0)]));
}

function merge(a: Activity, b: Activity): Activity {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, round2((out.get(k) ?? 0) + v));
  return out;
}

const pct = (part: number, whole: number) => (whole !== 0 ? round2((part / whole) * 100) : 0);

/** Profit & loss for a period. */
export async function profitAndLoss(companyId: string, p: Period = {}) {
  const { ledgerStartedAt, accounts } = await companyContext(companyId);
  const activity = merge(
    await journalActivity(companyId, accounts, p),
    await legacyPnlActivity(companyId, ledgerStartedAt, accounts, p)
  );

  const line = (a: any) => ({ accountId: a.id, account: a.name, code: a.code, amount: activity.get(a.id) ?? 0 });
  const revenueLines = accounts.filter((a) => a.type === 'revenue').map(line).filter((l) => l.amount !== 0);
  const cogsLines = accounts.filter((a) => a.systemKey === 'cogs').map(line).filter((l) => l.amount !== 0);
  const opexLines = accounts
    .filter((a) => a.type === 'expense' && a.systemKey !== 'cogs')
    .map(line)
    .filter((l) => l.amount !== 0)
    .sort((x, y) => y.amount - x.amount);

  const revenue = round2(revenueLines.reduce((s, l) => s + l.amount, 0));
  const cogs = round2(cogsLines.reduce((s, l) => s + l.amount, 0));
  const grossProfit = round2(revenue - cogs);
  const totalOpex = round2(opexLines.reduce((s, l) => s + l.amount, 0));
  const netProfit = round2(grossProfit - totalOpex);

  return {
    from: p.from ?? null,
    to: p.to ?? null,
    revenue,
    revenueBreakdown: revenueLines,
    cogs,
    grossProfit,
    grossMargin: pct(grossProfit, revenue),
    totalOpex,
    netProfit,
    netMargin: pct(netProfit, revenue),
    expenseBreakdown: opexLines,
    // kept for older clients
    totalExpenses: totalOpex,
    margin: pct(netProfit, revenue),
    includesPreLedgerRecords: !ledgerStartedAt || !p.from || p.from < ledgerStartedAt,
  };
}

/** Balances of every account as of a date (end of day), from the journal. */
export async function trialBalance(companyId: string, asOf: Date = new Date()) {
  const { ledgerStartedAt, accounts } = await companyContext(companyId);
  const activity = ledgerStartedAt
    ? await journalActivity(companyId, accounts, { to: asOf, includeOpening: true })
    : new Map<string, number>(accounts.map((a) => [a.id, round2(a.balance)])); // not started yet: cached balances

  const rows = accounts
    .map((a) => {
      const balance = activity.get(a.id) ?? 0;
      const debitSide = isDebitNormal(a.type) ? balance >= 0 : balance < 0;
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        balance,
        debit: debitSide ? Math.abs(balance) : 0,
        credit: debitSide ? 0 : Math.abs(balance),
      };
    })
    .filter((r) => r.balance !== 0)
    .sort((x, y) => (x.code ?? '9999').localeCompare(y.code ?? '9999') || x.name.localeCompare(y.name));

  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { asOf, ledgerStartedAt, rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

/** Balance sheet as of a date: assets = liabilities + equity (+ earnings to date). */
export async function balanceSheet(companyId: string, asOf: Date = new Date()) {
  const tb = await trialBalance(companyId, asOf);
  const group = (type: string) =>
    tb.rows.filter((r) => r.type === type).map((r) => ({ accountId: r.accountId, code: r.code, name: r.name, amount: r.balance }));
  const sum = (xs: { amount: number }[]) => round2(xs.reduce((s, x) => s + x.amount, 0));

  const assets = group('asset');
  const liabilities = group('liability');
  const equity = group('equity');
  const earnings = round2(sum(group('revenue')) - sum(group('expense')));

  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = round2(sum(equity) + earnings);
  return {
    asOf,
    ledgerStartedAt: tb.ledgerStartedAt,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity,
    earnings,
    totalEquity,
    totalLiabilitiesAndEquity: round2(totalLiabilities + totalEquity),
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
}

const CASH_FLOW_LABELS: Record<string, string> = {
  invoice_payment: 'Customer payments',
  invoice_cancel: 'Refunds to customers',
  purchase: 'Paid to suppliers on delivery',
  purchase_payment: 'Supplier payments',
  supplier_return: 'Refunds from suppliers',
  expense: 'Expenses',
  payroll: 'Payroll',
  manual: 'Owner and other entries',
};

/** Money in and out of the company's cash and bank accounts for a period. */
export async function cashFlow(companyId: string, p: Omit<Period, 'locationIds'> = {}) {
  const cashAccounts = await prisma.account.findMany({
    where: { companyId, type: 'asset', subtype: { in: ['cash', 'bank'] } },
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
  });
  const ids = cashAccounts.map((a) => a.id);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { ledgerStartedAt: true } });

  // Opening balance per account = all journal lines dated before `from`.
  const openingRows = p.from
    ? await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { companyId, accountId: { in: ids }, entry: { date: { lt: p.from } } },
        _sum: { debit: true, credit: true },
      })
    : [];
  const opening = new Map(openingRows.map((r) => [r.accountId, round2(Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0))]));

  // Closing balance per account = all journal lines up to `to`.
  const closingRows = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: { companyId, accountId: { in: ids }, ...(p.to ? { entry: { date: { lte: p.to } } } : {}) },
    _sum: { debit: true, credit: true },
  });
  const closing = new Map(closingRows.map((r) => [r.accountId, round2(Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0))]));

  // Cash and bank accounts belong to the whole company, so cash flow is
  // never filtered by location.
  const entryWhere: any = { sourceType: { not: 'opening_balance' } };
  const date = dateFilter(p.from, p.to);
  if (date) entryWhere.date = date;

  const lines = await prisma.journalLine.findMany({
    where: { companyId, accountId: { in: ids }, entry: entryWhere },
    select: { accountId: true, debit: true, credit: true, entry: { select: { id: true, sourceType: true } } },
  });

  const perAccount = new Map(ids.map((id) => [id, { inflow: 0, outflow: 0 }]));
  const perEntryNet = new Map<string, { sourceType: string; net: number }>();
  for (const l of lines) {
    const net = Number(l.debit) - Number(l.credit);
    const acc = perAccount.get(l.accountId)!;
    if (net > 0) acc.inflow += net; else acc.outflow -= net;
    const e = perEntryNet.get(l.entry.id) || { sourceType: l.entry.sourceType, net: 0 };
    e.net += net;
    perEntryNet.set(l.entry.id, e);
  }

  // By category: the net effect of each entry on total cash. Transfers
  // between your own accounts net to zero and are left out.
  const byCategory = new Map<string, { inflow: number; outflow: number }>();
  for (const e of perEntryNet.values()) {
    const net = round2(e.net);
    if (net === 0) continue;
    const label = CASH_FLOW_LABELS[e.sourceType] || 'Other';
    const c = byCategory.get(label) || { inflow: 0, outflow: 0 };
    if (net > 0) c.inflow += net; else c.outflow -= net;
    byCategory.set(label, c);
  }

  const accounts = cashAccounts.map((a) => {
    const flows = perAccount.get(a.id)!;
    const openingBalance = p.from ? opening.get(a.id) ?? 0 : null;
    return {
      accountId: a.id,
      name: a.name,
      subtype: a.subtype,
      bankName: a.bankName,
      opening: openingBalance,
      inflow: round2(flows.inflow),
      outflow: round2(flows.outflow),
      // Before the ledger starts, the stored balance is the only record.
      closing: company?.ledgerStartedAt ? closing.get(a.id) ?? 0 : round2(a.balance),
    };
  });

  const categories = Array.from(byCategory.entries())
    .map(([label, v]) => ({ label, inflow: round2(v.inflow), outflow: round2(v.outflow) }))
    .sort((x, y) => y.inflow + y.outflow - (x.inflow + x.outflow));
  const totalIn = round2(categories.reduce((s, c) => s + c.inflow, 0));
  const totalOut = round2(categories.reduce((s, c) => s + c.outflow, 0));

  const totalClosing = round2(accounts.reduce((s2, a) => s2 + a.closing, 0));
  return {
    from: p.from ?? null,
    to: p.to ?? null,
    ledgerStartedAt: company?.ledgerStartedAt ?? null,
    accounts,
    categories,
    totalIn,
    totalOut,
    net: round2(totalIn - totalOut),
    totalBalance: round2(cashAccounts.reduce((s, a) => s + a.balance, 0)),
    totalClosing,
  };
}

/** Month boundaries for the last `months` months including the current one. */
export function lastMonths(months: number, now = new Date()) {
  const out: { key: string; label: string; from: Date; to: Date }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1, 0, 0, 0, -1);
    out.push({
      key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`,
      label: from.toLocaleString('en-US', { month: 'short' }),
      from,
      to,
    });
  }
  return out;
}

/** Revenue, COGS, operating expenses and profit for each of the last N months. */
export async function monthlyPnl(companyId: string, months: number, locationIds?: string[]) {
  const ranges = lastMonths(months);
  const results = await Promise.all(ranges.map((r) => profitAndLoss(companyId, { from: r.from, to: r.to, locationIds })));
  return ranges.map((r, i) => ({
    month: r.label,
    key: r.key,
    revenue: results[i].revenue,
    cogs: results[i].cogs,
    opex: results[i].totalOpex,
    grossProfit: results[i].grossProfit,
    netProfit: results[i].netProfit,
  }));
}
