import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, requireTargetLocation, reportLocationIds } from '../../middleware/locationAuth';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { listPaymentAccounts, parsePositiveAmount, resolvePaymentAccount } from '../../lib/accounts';
import { postJournal, systemAccount, verifyLedger, round2, isDebitNormal, DEFAULT_ACCOUNT_KEYS } from '../../lib/ledger';
import { profitAndLoss, balanceSheet, trialBalance, cashFlow, monthlyPnl } from '../../lib/reports';
import { purchaseBalance } from '../purchases/purchase.service';
import { invoiceBalance } from '../../lib/invoiceBalance';

const router = Router();
router.use(authenticate);

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
/** Manual journal entries may not touch accounts kept in step with documents. */
const DOCUMENT_CONTROLLED = new Set(['ar', 'ap', 'inventory']);

function requireAdmin(req: Request) {
  if (req.user!.role !== 'admin') throw new AppError(403, 'Only an admin can do this');
}

/** Parse a date query/body value. Plain dates (YYYY-MM-DD) as `to` mean end of that day. */
function parseDate(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw badRequest(`Invalid date: ${value}`);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) d.setHours(23, 59, 59, 999);
  return d;
}

function periodFromQuery(req: Request) {
  return { from: parseDate(req.query.from), to: parseDate(req.query.to, true) };
}

const publicAccount = (a: any) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  code: a.code,
  subtype: a.subtype,
  systemKey: a.systemKey,
  bankName: a.bankName,
  accountNumber: a.accountNumber,
  isActive: a.isActive,
  balance: round2(a.balance),
});

// =====================================================================
// CHART OF ACCOUNTS
// =====================================================================

router.get('/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    for (const key of DEFAULT_ACCOUNT_KEYS) await systemAccount(prisma, companyId, key);
    const accounts = await prisma.account.findMany({
      where: { companyId },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: accounts.map(publicAccount) });
  } catch (err) { next(err); }
});

// Create an account: a bank account, an expense category, an equity account...
router.post('/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdmin(req);
    const companyId = req.user!.companyId;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
    if (!name) throw badRequest('Account name is required');
    let type = String(req.body?.type || '');
    let subtype: string | null = req.body?.subtype === 'bank' || req.body?.subtype === 'cash' ? req.body.subtype : null;
    if (subtype) type = 'asset';
    if (!ACCOUNT_TYPES.includes(type)) throw badRequest('Account type must be asset, liability, equity, revenue or expense');
    const clash = await prisma.account.findFirst({ where: { companyId, name: { equals: name, mode: 'insensitive' } } });
    if (clash) throw badRequest(`An account named "${clash.name}" already exists`);

    let code: string | null = typeof req.body?.code === 'string' && req.body.code.trim() ? req.body.code.trim() : null;
    if (!code && subtype === 'bank') {
      const banks = await prisma.account.count({ where: { companyId, subtype: 'bank' } });
      code = String(1010 + banks * 10);
    }
    const account = await prisma.account.create({
      data: {
        companyId,
        name,
        type,
        subtype,
        code,
        bankName: req.body?.bankName || null,
        accountNumber: req.body?.accountNumber || null,
        balance: 0,
      },
    });
    res.status(201).json({ success: true, data: publicAccount(account) });
  } catch (err) { next(err); }
});

// Rename an account or change its bank details; deactivate unused accounts.
router.put('/accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdmin(req);
    const companyId = req.user!.companyId;
    const account = await prisma.account.findFirst({ where: { id: req.params.id, companyId } });
    if (!account) throw notFound('Account not found');
    const data: any = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim().slice(0, 80);
      if (!name) throw badRequest('Account name is required');
      const clash = await prisma.account.findFirst({
        where: { companyId, id: { not: account.id }, name: { equals: name, mode: 'insensitive' } },
      });
      if (clash) throw badRequest(`An account named "${clash.name}" already exists`);
      data.name = name;
    }
    for (const f of ['bankName', 'accountNumber', 'code'] as const) {
      if (req.body?.[f] !== undefined) data[f] = req.body[f] ? String(req.body[f]).trim() : null;
    }
    if (req.body?.isActive !== undefined) {
      const isActive = !!req.body.isActive;
      if (!isActive && account.systemKey) throw badRequest('System accounts cannot be deactivated');
      if (!isActive && Math.abs(account.balance) > 0.009) {
        throw badRequest('Only accounts with a zero balance can be deactivated. Transfer the balance first.');
      }
      data.isActive = isActive;
    }
    const updated = await prisma.account.update({ where: { id: account.id }, data });
    res.json({ success: true, data: publicAccount(updated) });
  } catch (err) { next(err); }
});

// Account statement: opening balance, every movement with running balance, closing.
router.get('/accounts/:id/statement', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const account = await prisma.account.findFirst({ where: { id: req.params.id, companyId } });
    if (!account) throw notFound('Account not found');
    const { from, to } = periodFromQuery(req);
    const sign = isDebitNormal(account.type) ? 1 : -1;

    let opening = 0;
    if (from) {
      const agg = await prisma.journalLine.aggregate({
        where: { companyId, accountId: account.id, entry: { date: { lt: from } } },
        _sum: { debit: true, credit: true },
      });
      opening = round2(sign * (Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0)));
    }
    const lines = await prisma.journalLine.findMany({
      where: {
        companyId,
        accountId: account.id,
        entry: { ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      },
      include: { entry: { select: { id: true, date: true, description: true, sourceType: true, reference: true } } },
      orderBy: [{ entry: { date: 'asc' } }, { entry: { createdAt: 'asc' } }],
      take: 2000,
    });
    let running = opening;
    const rows = lines.map((l) => {
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      running = round2(running + sign * (debit - credit));
      return {
        entryId: l.entry.id,
        date: l.entry.date,
        description: l.entry.description,
        sourceType: l.entry.sourceType,
        reference: l.entry.reference,
        debit,
        credit,
        balance: running,
      };
    });
    res.json({
      success: true,
      data: { account: publicAccount(account), from: from ?? null, to: to ?? null, opening, rows, closing: running },
    });
  } catch (err) { next(err); }
});

// =====================================================================
// CASH & BANKS
// =====================================================================

router.get('/payment-accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accounts = await listPaymentAccounts(prisma, req.user!.companyId);
    res.json({
      success: true,
      data: accounts.map((a: any) => ({
        id: a.id, name: a.name, subtype: a.subtype, bankName: a.bankName,
        accountNumber: a.accountNumber, balance: round2(a.balance),
      })),
    });
  } catch (err) { next(err); }
});

// Move money between two of your own cash/bank accounts (not income or expense).
router.post('/transfers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const amount = parsePositiveAmount(req.body?.amount);
    const from = await resolvePaymentAccount(prisma, companyId, { accountId: req.body?.fromAccountId });
    const to = await resolvePaymentAccount(prisma, companyId, { accountId: req.body?.toAccountId });
    if (from.id === to.id) throw badRequest('Choose two different accounts');
    const date = parseDate(req.body?.date) ?? new Date();
    const entry = await prisma.$transaction((tx) =>
      postJournal(tx, {
        companyId,
        description: req.body?.notes ? `Transfer: ${String(req.body.notes).slice(0, 120)}` : `Transfer from ${from.name} to ${to.name}`,
        sourceType: 'transfer',
        reference: req.body?.reference || null,
        date,
        createdById: req.user!.id,
        lines: [
          { accountId: to.id, debit: amount },
          { accountId: from.id, credit: amount },
        ],
      })
    );
    res.status(201).json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// =====================================================================
// VAT
// =====================================================================

/**
 * VAT for a period, from the VAT Payable account: charged on invoices,
 * reversed by cancellations, paid to the tax authority, and what is owed now.
 */
router.get('/vat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const { from, to } = periodFromQuery(req);
    const [company, account, inputAccount] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { vatRate: true, vatNumber: true } }),
      prisma.account.findFirst({ where: { companyId, systemKey: 'vat_payable' } }),
      prisma.account.findFirst({ where: { companyId, systemKey: 'vat_input' } }),
    ]);
    const lines = account
      ? await prisma.journalLine.findMany({
          where: { companyId, accountId: account.id, entry: { date: { ...(from && { gte: from }), ...(to && { lte: to }) } } },
          include: { entry: { select: { id: true, date: true, sourceType: true, sourceId: true, reference: true, description: true } } },
          orderBy: { entry: { date: 'asc' } },
        })
      : [];
    let charged = 0, reversed = 0, paid = 0, adjusted = 0, offset = 0;
    const months = new Map<string, { month: string; charged: number; reversed: number; paid: number }>();
    const payments: { id: string; date: Date; amount: number; reference: string | null; description: string }[] = [];
    for (const l of lines) {
      const debit = Number(l.debit), credit = Number(l.credit);
      const key = l.entry.date.toISOString().slice(0, 7);
      const m = months.get(key) ?? { month: key, charged: 0, reversed: 0, paid: 0 };
      if (l.entry.sourceType === 'invoice') { charged += credit - debit; m.charged += credit - debit; }
      else if (l.entry.sourceType === 'invoice_cancel' || l.entry.sourceType === 'credit_note') { reversed += debit - credit; m.reversed += debit - credit; }
      else if (l.entry.sourceType === 'vat_offset') { offset += debit - credit; }
      else if (l.entry.sourceType === 'vat_payment') {
        paid += debit - credit; m.paid += debit - credit;
        payments.push({ id: l.entry.id, date: l.entry.date, amount: round2(debit - credit), reference: l.entry.reference, description: l.entry.description });
      } else adjusted += credit - debit;
      months.set(key, m);
    }
    // Input VAT: paid to suppliers on deliveries and expenses (recoverable),
    // less returns to suppliers.
    const inputLines = inputAccount
      ? await prisma.journalLine.findMany({
          where: { companyId, accountId: inputAccount.id, entry: { date: { ...(from && { gte: from }), ...(to && { lte: to }) } } },
          include: { entry: { select: { sourceType: true, date: true } } },
        })
      : [];
    let inputPaid = 0, inputReversed = 0;
    for (const l of inputLines) {
      const debit = Number(l.debit), credit = Number(l.credit);
      if (l.entry.sourceType === 'vat_offset') continue;
      const key = l.entry.date.toISOString().slice(0, 7);
      const m = months.get(key) ?? { month: key, charged: 0, reversed: 0, paid: 0 };
      if (l.entry.sourceType === 'supplier_return') inputReversed += credit - debit;
      else inputPaid += debit - credit;
      (m as any).input = ((m as any).input ?? 0) + (debit - credit);
      months.set(key, m);
    }

    // Invoices that charged VAT in the period (net of the discount, before VAT).
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId, taxTotal: { gt: 0 }, finalizedAt: { not: null, ...(from && { gte: from }), ...(to && { lte: to }) },
      },
      select: {
        id: true, invoiceNumber: true, finalizedAt: true, status: true, total: true, taxTotal: true, taxRate: true,
        customerName: true, customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { finalizedAt: 'desc' },
    });
    res.json({
      success: true,
      data: {
        vatRate: company?.vatRate ?? 0,
        vatNumber: company?.vatNumber ?? null,
        owed: round2(account?.balance ?? 0),
        recoverable: round2(inputAccount?.balance ?? 0),
        netDue: round2((account?.balance ?? 0) - (inputAccount?.balance ?? 0)),
        period: {
          charged: round2(charged), reversed: round2(reversed), net: round2(charged - reversed),
          paid: round2(paid), adjusted: round2(adjusted), offset: round2(offset),
          inputPaid: round2(inputPaid), inputReversed: round2(inputReversed),
          inputNet: round2(inputPaid - inputReversed),
          netForPeriod: round2(charged - reversed - (inputPaid - inputReversed)),
        },
        months: Array.from(months.values())
          .sort((a, b) => a.month.localeCompare(b.month))
          .map((m) => ({
            month: m.month, charged: round2(m.charged), reversed: round2(m.reversed), paid: round2(m.paid),
            input: round2((m as any).input ?? 0),
          })),
        payments: payments.reverse(),
        invoices: invoices.map((i) => ({
          id: i.id, invoiceNumber: i.invoiceNumber, date: i.finalizedAt, status: i.status, taxRate: i.taxRate,
          customer: i.customer ? `${i.customer.firstName} ${i.customer.lastName}`.trim() : i.customerName,
          net: round2(i.total - i.taxTotal), vat: round2(i.taxTotal), total: round2(i.total),
        })),
      },
    });
  } catch (err) { next(err); }
});

/**
 * Set input VAT against output VAT when filing a return: Dr VAT Payable /
 * Cr VAT Recoverable. Defaults to the most that can be set off.
 */
router.post('/vat/offset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const entry = await prisma.$transaction(async (tx) => {
      const payable = await systemAccount(tx, companyId, 'vat_payable');
      const input = await systemAccount(tx, companyId, 'vat_input');
      const most = round2(Math.min(Math.max(0, payable.balance), Math.max(0, input.balance)));
      const amount = req.body?.amount === undefined || req.body?.amount === '' ? most : parsePositiveAmount(req.body.amount);
      if (!(amount > 0)) throw badRequest('There is no input VAT to set against VAT owed');
      if (amount > most + 0.01) throw badRequest(`At most ${most.toFixed(2)} can be set off now`);
      return postJournal(tx, {
        companyId,
        description: 'Input VAT set against VAT owed',
        sourceType: 'vat_offset',
        date: parseDate(req.body?.date) ?? new Date(),
        createdById: req.user!.id,
        lines: [
          { accountId: payable.id, debit: amount },
          { accountId: input.id, credit: amount },
        ],
      });
    });
    res.status(201).json({ success: true, data: entry });
  } catch (err) { next(err); }
});

/** Pay VAT to the tax authority: Dr VAT Payable / Cr Cash or Bank. */
router.post('/vat/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const amount = parsePositiveAmount(req.body?.amount);
    const from = await resolvePaymentAccount(prisma, companyId, { accountId: req.body?.accountId });
    const date = parseDate(req.body?.date) ?? new Date();
    const entry = await prisma.$transaction(async (tx) => {
      const vat = await systemAccount(tx, companyId, 'vat_payable');
      if (amount > round2(vat.balance) + 0.01) {
        throw badRequest(`That is more than the VAT owed (${round2(vat.balance).toFixed(2)})`);
      }
      return postJournal(tx, {
        companyId,
        description: req.body?.notes ? `VAT payment: ${String(req.body.notes).slice(0, 120)}` : 'VAT payment to tax authority',
        sourceType: 'vat_payment',
        reference: req.body?.reference || null,
        date,
        createdById: req.user!.id,
        lines: [
          { accountId: vat.id, debit: amount },
          { accountId: from.id, credit: amount },
        ],
      });
    });
    res.status(201).json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// =====================================================================
// JOURNAL
// =====================================================================

router.get('/journal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const { from, to } = periodFromQuery(req);
    const page = Math.max(1, parseInt(String(req.query.page || '1')) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '50')) || 50));
    const where: any = { companyId };
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (typeof req.query.sourceType === 'string' && req.query.sourceType) where.sourceType = req.query.sourceType;
    if (typeof req.query.accountId === 'string' && req.query.accountId) where.lines = { some: { accountId: req.query.accountId } };
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const q = req.query.search.trim();
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [total, entries] = await Promise.all([
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          location: { select: { name: true } },
          lines: { include: { account: { select: { id: true, name: true, code: true, type: true } } } },
        },
      }),
    ]);
    res.json({
      success: true,
      data: {
        total,
        page,
        pageSize,
        entries: entries.map((e) => ({
          ...e,
          lines: e.lines.map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) })),
        })),
      },
    });
  } catch (err) { next(err); }
});

// Manual journal entry (owner capital, drawings, loans, corrections...).
// Receivables, payables and inventory are excluded: they must always match
// invoices, purchases and stock, so they change only through those screens.
router.post('/journal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdmin(req);
    const companyId = req.user!.companyId;
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 200) : '';
    if (!description) throw badRequest('Description is required');
    const raw = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const lines = raw
      .map((l: any) => ({
        accountId: String(l?.accountId || ''),
        debit: round2(Number(l?.debit) || 0),
        credit: round2(Number(l?.credit) || 0),
        memo: l?.memo ? String(l.memo).slice(0, 200) : null,
      }))
      .filter((l: any) => l.accountId && (l.debit || l.credit));
    if (lines.length < 2) throw badRequest('A journal entry needs at least two lines');
    for (const l of lines) {
      if (l.debit < 0 || l.credit < 0) throw badRequest('Amounts must be positive');
      if (l.debit && l.credit) throw badRequest('Each line is either a debit or a credit, not both');
    }
    const totalDebit = round2(lines.reduce((s: number, l: any) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s: number, l: any) => s + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw badRequest(`Debits (${totalDebit.toFixed(2)}) must equal credits (${totalCredit.toFixed(2)})`);
    }
    const accounts = await prisma.account.findMany({
      where: { companyId, id: { in: lines.map((l: any) => l.accountId) } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const l of lines) {
      const a = byId.get(l.accountId);
      if (!a) throw notFound('Account not found');
      if (!a.isActive) throw badRequest(`"${a.name}" is inactive`);
      if (a.systemKey && DOCUMENT_CONTROLLED.has(a.systemKey)) {
        throw badRequest(`"${a.name}" changes only through invoices, purchases and stock, not manual entries`);
      }
    }
    const entry = await prisma.$transaction((tx) =>
      postJournal(tx, {
        companyId,
        description,
        sourceType: 'manual',
        reference: req.body?.reference || null,
        date: parseDate(req.body?.date) ?? new Date(),
        createdById: req.user!.id,
        lines,
      })
    );
    res.status(201).json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// Self-check: every entry balances and cached balances match the journal.
router.get('/ledger-check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await verifyLedger(prisma, req.user!.companyId) });
  } catch (err) { next(err); }
});

// Records from before the double-entry ledger (read-only history).
router.get('/transactions', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.query;
    const { from, to } = periodFromQuery(req);
    const where: any = { companyId: req.user!.companyId, ...locationWhere(req) };
    if (type) where.type = type;
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 500,
      include: { account: { select: { name: true, type: true } } },
    });
    res.json({ success: true, data: transactions });
  } catch (err) { next(err); }
});

// =====================================================================
// EXPENSES
// =====================================================================

router.get('/expense-categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    for (const key of ['rent', 'utilities', 'salaries', 'general_expense'] as const) {
      await systemAccount(prisma, companyId, key);
    }
    const cats = await prisma.account.findMany({
      where: { companyId, type: 'expense', isActive: true, systemKey: { notIn: ['cogs', 'inventory_loss'] } },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: cats.map((a) => ({ id: a.id, name: a.name, code: a.code })) });
  } catch (err) { next(err); }
});

// Expenses: journal entries since the ledger started, plus older records.
router.get('/expenses', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { ledgerStartedAt: true } });
    const entries = await prisma.journalEntry.findMany({
      where: { companyId, sourceType: 'expense', ...locationWhere(req) },
      orderBy: { date: 'desc' },
      take: 1000,
      include: { lines: { include: { account: { select: { name: true, type: true, subtype: true } } } } },
    });
    const fromLedger = entries.map((e) => {
      const exp = e.lines.find((l) => l.account.type === 'expense');
      const paid = e.lines.find((l) => l.account.type === 'asset');
      return {
        id: e.id,
        date: e.date,
        description: e.description,
        reference: e.reference,
        amount: Number(exp?.debit ?? 0),
        account: { name: exp?.account.name ?? '—' },
        paidFrom: paid?.account.name ?? null,
        legacy: false,
      };
    });
    const legacyRows = await prisma.transaction.findMany({
      where: {
        companyId,
        type: 'expense',
        ...locationWhere(req),
        account: { systemKey: { not: 'inventory_loss' } },
        ...(company?.ledgerStartedAt ? { date: { lt: company.ledgerStartedAt } } : {}),
      },
      orderBy: { date: 'desc' },
      include: { account: { select: { name: true } } },
    });
    const legacy = legacyRows.map((t) => ({
      id: t.id, date: t.date, description: t.description, reference: null,
      amount: t.amount, account: { name: t.account.name }, paidFrom: 'Cash', legacy: true,
    }));
    const all = [...fromLedger, ...legacy].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json({ success: true, data: all });
  } catch (err) { next(err); }
});

// Record an expense: Dr expense category / Cr cash or bank account.
router.post('/expenses', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const { category, categoryId, description, date, reference } = req.body;
    const amount = parsePositiveAmount(req.body?.amount);

    let account;
    if (categoryId) {
      account = await prisma.account.findFirst({ where: { id: categoryId, companyId } });
      if (!account) throw notFound('Expense category not found');
    } else {
      const name = typeof category === 'string' && category.trim() ? category.trim().slice(0, 80) : '';
      account = name
        ? await prisma.account.findFirst({ where: { companyId, name: { equals: name, mode: 'insensitive' } } })
        : await systemAccount(prisma, companyId, 'general_expense');
      if (!account && name) {
        account = await prisma.account.create({ data: { companyId, name, type: 'expense', balance: 0 } });
      }
    }
    if (!account || account.type !== 'expense' || account.systemKey === 'cogs' || account.systemKey === 'inventory_loss') {
      throw badRequest(`"${account?.name ?? category}" is not an expense category`);
    }
    const payFrom = await resolvePaymentAccount(prisma, companyId, {
      accountId: req.body?.accountId,
      account: req.body?.account,
    });
    const locationId = requireTargetLocation(req);
    // VAT included in the amount paid is recoverable input VAT, not a cost.
    let vatAmount = 0;
    if (req.body?.vatAmount !== undefined && req.body?.vatAmount !== null && req.body?.vatAmount !== '' && Number(req.body.vatAmount) !== 0) {
      vatAmount = parsePositiveAmount(req.body.vatAmount, 'VAT');
      if (vatAmount >= amount) throw badRequest('VAT must be less than the amount paid');
    }

    const entry = await prisma.$transaction(async (tx) => {
      const vatInput = vatAmount > 0 ? await systemAccount(tx, companyId, 'vat_input') : null;
      return postJournal(tx, {
        companyId,
        locationId,
        description: (description && String(description).trim()) || account!.name,
        sourceType: 'expense',
        reference: reference || null,
        date: parseDate(date) ?? new Date(),
        createdById: req.user!.id,
        lines: [
          { accountId: account!.id, debit: round2(amount - vatAmount) },
          ...(vatInput ? [{ accountId: vatInput.id, debit: vatAmount }] : []),
          { accountId: payFrom.id, credit: amount },
        ],
      });
    });
    res.status(201).json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// =====================================================================
// RECEIVABLES & PAYABLES
// =====================================================================

// ---------- RECEIVABLE (location-scoped) ----------
router.get('/receivable', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['unpaid', 'partially_paid', 'overdue'] },
        ...locationWhere(req),
      },
      include: { customer: { select: { firstName: true, lastName: true } } },
    });

    const now = new Date();
    const buckets = { current: 0, days30: 0, days60: 0, days90: 0 };
    let total = 0;

    const rows = invoices.map((inv) => {
      const balance = invoiceBalance(inv);
      total += balance;
      const due = inv.dueDate ? new Date(inv.dueDate) : now;
      const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

      let bucket = 'current';
      if (diffDays > 60) { bucket = 'days90'; buckets.days90 += balance; }
      else if (diffDays > 30) { bucket = 'days60'; buckets.days60 += balance; }
      else if (diffDays > 0) { bucket = 'days30'; buckets.days30 += balance; }
      else { buckets.current += balance; }

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customer: inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}` : '—',
        dueDate: inv.dueDate,
        total: inv.total,
        amountPaid: inv.amountPaid,
        balance,
        daysOverdue: diffDays > 0 ? diffDays : 0,
        bucket,
      };
    });

    res.json({ success: true, data: { summary: { total, ...buckets }, rows } });
  } catch (err) { next(err); }
});


router.get('/payable', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const purchases = await prisma.purchase.findMany({
      where: { companyId, ...locationWhere(req) },
      include: { supplier: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    const now = new Date();
    const buckets = { current: 0, days30: 0, days60: 0, days90: 0 };
    const rows = purchases
      .map((p) => ({ p, balance: purchaseBalance(p) }))
      .filter(({ balance }) => balance > 0.009)
      .map(({ p, balance }) => {
        const due = p.dueDate ? new Date(p.dueDate) : new Date(p.date);
        const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
        const bucket = days > 60 ? 'days90' : days > 30 ? 'days60' : days > 0 ? 'days30' : 'current';
        (buckets as any)[bucket] += balance;
        return {
          id: p.id,
          reference: p.reference,
          supplier: p.supplier?.name ?? '—',
          date: p.date,
          dueDate: p.dueDate,
          total: p.total,
          amountPaid: p.amountPaid,
          returnedAmount: p.returnedAmount,
          balance,
          daysOverdue: Math.max(0, days),
          bucket,
        };
      });
    const total = round2(rows.reduce((s, r) => s + r.balance, 0));
    res.json({
      success: true,
      data: {
        summary: {
          total,
          current: round2(buckets.current),
          days30: round2(buckets.days30),
          days60: round2(buckets.days60),
          days90: round2(buckets.days90),
        },
        rows,
      },
    });
  } catch (err) { next(err); }
});

// =====================================================================
// FINANCIAL STATEMENTS
// =====================================================================

router.get('/profit-loss', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = periodFromQuery(req);
    const data = await profitAndLoss(req.user!.companyId, { from, to, locationIds: await reportLocationIds(req) });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/profit-loss/monthly', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const months = Math.min(Math.max(parseInt(String(req.query.months || '12')) || 12, 1), 24);
    const data = await monthlyPnl(req.user!.companyId, months, await reportLocationIds(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/balance-sheet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asOf = parseDate(req.query.asOf, true) ?? new Date();
    res.json({ success: true, data: await balanceSheet(req.user!.companyId, asOf) });
  } catch (err) { next(err); }
});

router.get('/trial-balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asOf = parseDate(req.query.asOf, true) ?? new Date();
    res.json({ success: true, data: await trialBalance(req.user!.companyId, asOf) });
  } catch (err) { next(err); }
});

router.get('/cash-flow', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = periodFromQuery(req);
    res.json({ success: true, data: await cashFlow(req.user!.companyId, { from, to }) });
  } catch (err) { next(err); }
});

// One call for the Accounting overview page.
router.get('/overview', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const locationIds = await reportLocationIds(req);
    const [cash, month, ytd, invoices, purchases, company] = await Promise.all([
      listPaymentAccounts(prisma, companyId),
      profitAndLoss(companyId, { from: monthStart, to: now, locationIds }),
      profitAndLoss(companyId, { from: yearStart, to: now, locationIds }),
      prisma.invoice.findMany({
        where: { companyId, status: { in: ['unpaid', 'partially_paid', 'overdue'] }, ...locationWhere(req) },
        select: { total: true, amountPaid: true, creditedAmount: true },
      }),
      prisma.purchase.findMany({
        where: { companyId, ...locationWhere(req) },
        select: { total: true, amountPaid: true, returnedAmount: true },
      }),
      prisma.company.findUnique({ where: { id: companyId }, select: { ledgerStartedAt: true } }),
    ]);
    res.json({
      success: true,
      data: {
        ledgerStartedAt: company?.ledgerStartedAt ?? null,
        cashAccounts: cash.map((a: any) => ({ id: a.id, name: a.name, subtype: a.subtype, bankName: a.bankName, balance: round2(a.balance) })),
        totalCash: round2(cash.reduce((s: number, a: any) => s + a.balance, 0)),
        receivables: round2(invoices.reduce((s, i) => s + invoiceBalance(i), 0)),
        payables: round2(purchases.reduce((s, p) => s + Math.max(0, purchaseBalance(p)), 0)),
        thisMonth: month,
        yearToDate: ytd,
      },
    });
  } catch (err) { next(err); }
});

export default router;
