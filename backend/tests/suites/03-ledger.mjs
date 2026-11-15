// Phase 2: a full factory month through the double-entry ledger, with every
// expected figure worked out by hand beforehand.
const BASE = process.env.TEST_API_URL || 'http://localhost:4100/api';
let pass = 0, fail = 0; const out = [];
const check = (n, c, d = '') => { c ? pass++ : fail++; out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${!c ? `  -> ${d}` : ''}`); };
async function call(T, method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); return { status: r.status, data: j.data, json: j };
}
const reg = await (await fetch(BASE + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ firstName: 'P2', lastName: 'Owner', email: `p2-${Date.now()}@example.test`, password: 'Password123!', company: 'Ledger Mills' }) })).json();
const T = reg.data.token;
const C = (m, p, b) => call(T, m, p, b);
const balanced = async (label) => {
  const lc = (await C('GET', '/accounting/ledger-check')).data;
  check(`Ledger balanced after ${label}`, lc.balanced && lc.balanceMismatches.length === 0, JSON.stringify(lc));
};

let accts = (await C('GET', '/accounting/accounts')).data;
const key = (k) => accts.find((a) => a.systemKey === k);
check('New company starts on the ledger', !!(await C('GET', '/accounting/ledger-check')).data.ledgerStartedAt);
check('New company has Cash, a bank account and system roles', !!key('cash') && accts.some((a) => a.subtype === 'bank') && !!key('owner_capital'));
let bankAcc = accts.find((a) => a.subtype === 'bank');
const cash = key('cash');

// Rename the bank: postings must keep working (accounts are found by role, not name).
const ren = await C('PUT', `/accounting/accounts/${bankAcc.id}`, { name: 'GTBank', bankName: 'Guaranty Trust Bank', accountNumber: '0123456789' });
check('Rename bank account', ren.status === 200 && ren.data.name === 'GTBank');
const bank2 = await C('POST', '/accounting/accounts', { name: 'Access Bank', subtype: 'bank', bankName: 'Access Bank', accountNumber: '9876543210' });
check('Add a second bank account', bank2.status === 201 && bank2.data.subtype === 'bank' && bank2.data.code === '1020', JSON.stringify(bank2.json));
const pa = (await C('GET', '/accounting/payment-accounts')).data.map((a) => a.name).join(',');
check('Payment accounts: Cash, GTBank, Access Bank', pa === 'Cash,GTBank,Access Bank', pa);
check('Duplicate account name rejected', (await C('POST', '/accounting/accounts', { name: 'gtbank', subtype: 'bank' })).status === 400);

// 1. Owner puts 100,000 into GTBank
const cap = await C('POST', '/accounting/journal', { description: 'Owner capital', lines: [
  { accountId: bankAcc.id, debit: 100000 }, { accountId: key('owner_capital').id, credit: 100000 }] });
check('Owner capital (manual journal)', cap.status === 201, JSON.stringify(cap.json));
check('Manual entry on Receivables refused', (await C('POST', '/accounting/journal', { description: 'x', lines: [
  { accountId: key('ar').id, debit: 10 }, { accountId: cash.id, credit: 10 }] })).status === 400);
check('Unbalanced manual entry refused', (await C('POST', '/accounting/journal', { description: 'x', lines: [
  { accountId: cash.id, debit: 10 }, { accountId: key('owner_capital').id, credit: 9 }] })).status === 400);

// 2. Receive 100 flour @100 = 10,000; pay 4,000 now from GTBank
const supp = (await C('POST', '/suppliers', { name: 'Maize Farms' })).data;
const cust = (await C('POST', '/customers', { firstName: 'Ayo', lastName: 'Foods' })).data;
const flour = (await C('POST', '/products', { name: 'Flour', price: 250, cost: 100 })).data;
const po = (await C('POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 100, unitCost: 100 }], supplierId: supp.id,
  paymentStatus: 'partially_paid', amountPaid: 4000, paymentAccountId: bankAcc.id, reference: 'PO-1' })).data;
await balanced('receiving');
// 3. Opening stock: 10 bags @5 = 50
await C('POST', '/products', { name: 'Bags', price: 0, cost: 5, quantity: 10 });
await balanced('opening stock');
// 4-5. Sell 40 @250 = 10,000 (COGS 4,000), paid into GTBank
const inv1 = (await C('POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 40, unitPrice: 250 }] })).data;
await C('POST', `/invoices/${inv1.id}/finalize`);
await C('POST', `/invoices/${inv1.id}/payment`, { amount: 10000, accountId: bankAcc.id });
await balanced('a paid sale');
// 6. Sell 10 = 2,500, 1,000 paid in cash, then cancelled with refund from cash
const inv2 = (await C('POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 10, unitPrice: 250 }] })).data;
await C('POST', `/invoices/${inv2.id}/finalize`);
await C('POST', `/invoices/${inv2.id}/payment`, { amount: 1000, accountId: cash.id });
const cancel = await C('POST', `/invoices/${inv2.id}/cancel`, { refundAccountId: cash.id });
check('Cancel part-paid invoice with refund', cancel.status === 200, JSON.stringify(cancel.json));
await balanced('a cancellation with refund');
// 7. Write off 5 flour (500)
await C('POST', '/stock/damage', { productId: flour.id, quantity: 5, reason: 'Wet' });
// 8. Count flour: 55 on hand, counted 57 -> +2 @100 = 200 gain
const cnt = await C('POST', '/stock/count', { productId: flour.id, countedQuantity: 57 });
check('Count finds 2 extra', cnt.data?.delta === 2, JSON.stringify(cnt.json));
await balanced('write-off and count');
// 9. Rent 2,000 from GTBank
const cats = (await C('GET', '/accounting/expense-categories')).data;
const rent = cats.find((c) => c.name === 'Rent Expense');
const ex = await C('POST', '/accounting/expenses', { categoryId: rent.id, amount: 2000, accountId: bankAcc.id, description: 'Factory rent' });
check('Expense paid from bank', ex.status === 201, JSON.stringify(ex.json));
check('Expense category cannot be COGS', (await C('POST', '/accounting/expenses', { categoryId: key('cogs').id, amount: 1 })).status === 400);
// 10. Payroll: gross 1,000, 10% withheld -> net 900 from GTBank
await C('POST', '/employees', { firstName: 'Ade', lastName: 'Miller', salary: 1000 });
const run = (await C('POST', '/payroll/run', { period: '2026-11', deductionRate: 10 })).data;
const pay = await C('POST', `/payroll/${run[0].id}/pay`, { accountId: bankAcc.id });
check('Payroll paid from bank', pay.status === 200, JSON.stringify(pay.json));
check('Payroll cannot be paid twice', (await C('POST', `/payroll/${run[0].id}/pay`, { accountId: bankAcc.id })).status === 400);
check('Bad deduction rate rejected', (await C('POST', '/payroll/run', { period: '2026-12', deductionRate: 150 })).status === 400);
await balanced('payroll');
// 11. Move 5,000 GTBank -> Cash
const tr = await C('POST', '/accounting/transfers', { fromAccountId: bankAcc.id, toAccountId: cash.id, amount: 5000 });
check('Transfer between own accounts', tr.status === 201, JSON.stringify(tr.json));
check('Transfer to the same account refused', (await C('POST', '/accounting/transfers', { fromAccountId: cash.id, toAccountId: cash.id, amount: 1 })).status === 400);
// 12. Pay the supplier the remaining 6,000, then return 10 flour (1,000) refunded in cash
await C('POST', `/purchases/${po.id}/pay`, { amount: 6000, accountId: bankAcc.id });
const batch = (await C('GET', `/purchases/${po.id}`)).data.batches[0];
const ret = await C('POST', `/purchases/${po.id}/return`, { batchId: batch.id, quantity: 10, refundAccountId: cash.id });
check('Supplier return refunded in cash', ret.status === 200 && ret.data.refund === 1000, JSON.stringify(ret.json));
await balanced('supplier payment and return');

// ---------- statements ----------
const pl = (await C('GET', '/accounting/profit-loss')).data;
check('P&L revenue 10,000 (cancelled sale excluded)', pl.revenue === 10000, String(pl.revenue));
check('P&L COGS 4,000', pl.cogs === 4000, String(pl.cogs));
check('P&L gross profit 6,000', pl.grossProfit === 6000);
check('P&L expenses 3,300 (rent 2,000 + salary 1,000 + net stock loss 300)', pl.totalOpex === 3300, JSON.stringify(pl.expenseBreakdown));
check('P&L net profit 2,700', pl.netProfit === 2700, String(pl.netProfit));

accts = (await C('GET', '/accounting/accounts')).data;
const bal = (n) => accts.find((a) => a.name === n)?.balance;
check('GTBank = 92,100', bal('GTBank') === 92100, String(bal('GTBank')));
check('Cash = 6,000', bal('Cash') === 6000, String(bal('Cash')));
check('Inventory = 4,750 (47 flour @100 + 10 bags @5)', bal('Finished Goods Inventory') === 4750, String(bal('Finished Goods Inventory')));
check('Receivables = 0', bal('Accounts Receivable') === 0, String(bal('Accounts Receivable')));
check('Payables = 0', bal('Accounts Payable') === 0, String(bal('Accounts Payable')));
check('Payroll deductions owed = 100', bal('Payroll Deductions Payable') === 100, String(bal('Payroll Deductions Payable')));

const bs = (await C('GET', '/accounting/balance-sheet')).data;
check('Balance sheet: assets 102,850 = liabilities + equity', bs.totalAssets === 102850 && bs.balanced, `${bs.totalAssets} vs ${bs.totalLiabilitiesAndEquity}`);
check('Balance sheet earnings = P&L net profit', bs.earnings === 2700, String(bs.earnings));
const tb = (await C('GET', '/accounting/trial-balance')).data;
check('Trial balance balances', tb.balanced, `${tb.totalDebit}/${tb.totalCredit}`);

const cf = (await C('GET', '/accounting/cash-flow')).data;
check('Cash flow: in 112,000, out 13,900, net 98,100', cf.totalIn === 112000 && cf.totalOut === 13900 && cf.net === 98100, JSON.stringify([cf.totalIn, cf.totalOut, cf.net, cf.categories]));
check('Cash flow leaves transfers out', !cf.categories.some((c) => /transfer/i.test(c.label)));
check('Cash + banks closing = 98,100', cf.totalClosing === 98100, String(cf.totalClosing));

const stmt = (await C('GET', `/accounting/accounts/${bankAcc.id}/statement`)).data;
check('GTBank statement closes at its balance', stmt.closing === 92100 && stmt.rows.length >= 7, `${stmt.closing} rows=${stmt.rows.length}`);
const sc = (await C('GET', '/stock/check')).data;
check('Inventory account equals stock batches exactly', sc.summary.inventoryAccountDifference === 0 && sc.summary.issues === 0, JSON.stringify(sc.summary));

// ---------- dashboard and reports agree with the P&L ----------
const dash = (await C('GET', '/dashboard/summary?months=12')).data;
check('Dashboard revenue = P&L revenue', dash.revenue === pl.revenue && dash.netProfit === pl.netProfit, JSON.stringify([dash.revenue, dash.netProfit]));
check('Dashboard cash = cash + banks (98,100)', dash.totalCash === 98100, String(dash.totalCash));
check('Dashboard inventory value = Inventory account', dash.inventoryValue === 4750, String(dash.inventoryValue));
const months = (await C('GET', '/dashboard/monthly-chart?months=3')).data;
check('Monthly chart this month = P&L', months.at(-1).revenue === 10000 && months.at(-1).netProfit === 2700, JSON.stringify(months.at(-1)));
const sbm = (await C('GET', '/reports/sales-by-month')).data;
check('Reports: sales this month = 10,000', sbm.at(-1).total === 10000, JSON.stringify(sbm.at(-1)));
const exl = (await C('GET', '/accounting/expenses')).data;
check('Expenses list shows rent paid from GTBank', exl.some((e) => e.amount === 2000 && e.paidFrom === 'GTBank'), JSON.stringify(exl));
const ov = (await C('GET', '/accounting/overview')).data;
check('Overview: this month net profit 2,700, cash 98,100', ov.thisMonth.netProfit === 2700 && ov.totalCash === 98100, JSON.stringify([ov.thisMonth.netProfit, ov.totalCash]));
const jr = (await C('GET', '/accounting/journal?pageSize=100')).data;
check('Journal lists every entry with balanced lines', jr.entries.every((e) => Math.abs(e.lines.reduce((s, l) => s + l.debit - l.credit, 0)) < 0.005) && jr.total >= 12, `total=${jr.total}`);

// ---------- account rules ----------
check("Can't deactivate an account with a balance", (await C('PUT', `/accounting/accounts/${bankAcc.id}`, { isActive: false })).status === 400);
check("Can't deactivate a system account", (await C('PUT', `/accounting/accounts/${cash.id}`, { isActive: false })).status === 400);
const deact = await C('PUT', `/accounting/accounts/${bank2.data.id}`, { isActive: false });
check('Unused bank account can be deactivated', deact.status === 200 && deact.data.isActive === false);
check('Deactivated account no longer offered for payments', !(await C('GET', '/accounting/payment-accounts')).data.some((a) => a.name === 'Access Bank'));

// ---------- as the browser calls it: with the selected location header ----------
const locId = (await C('GET', '/locations')).data[0].id;
const H = async (path) => {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${T}`, 'x-location-id': locId } });
  return (await r.json()).data;
};
const plH = await H('/accounting/profit-loss');
check('P&L with location selected includes payroll and company-wide entries', plH.netProfit === 2700 && plH.totalOpex === 3300, JSON.stringify([plH.netProfit, plH.totalOpex]));
const cfH = await H('/accounting/cash-flow');
check('Cash flow with location selected includes owner capital', cfH.totalIn === 112000 && cfH.totalOut === 13900, JSON.stringify([cfH.totalIn, cfH.totalOut]));
const dashH = await H('/dashboard/summary?months=12');
check('Dashboard with location selected matches', dashH.netProfit === 2700 && dashH.cashIn === 112000, JSON.stringify([dashH.netProfit, dashH.cashIn]));

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
