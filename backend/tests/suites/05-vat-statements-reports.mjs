// Phase 5: VAT, statements, profile/password, margin / production / stock-movement reports.
const B = process.env.TEST_API_URL || 'http://localhost:4100/api';
let T = null;
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${!c ? `  -> ${d}` : ''}`); };
const near = (a, b) => Math.abs(a - b) < 0.011;
async function call(method, path, body, token = T) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data, message: j.message };
}
const C = async (m, p, b) => { const r = await call(m, p, b); if (r.status >= 400) throw new Error(`${m} ${p}: ${r.status} ${r.message}`); return r.data; };

const email = `p5-${Date.now()}@example.test`;
const reg = await call('POST', '/auth/register', { firstName: 'Aisha', lastName: 'Bello', email, password: 'Password123!', company: 'P5 Mills' }, null);
T = reg.data.token;
await C('POST', '/settings/onboarding', { businessType: 'manufacturing', currency: 'NGN' });
const accts = await C('GET', '/accounting/accounts');
const bank = accts.find((a) => a.subtype === 'bank');
const cash = accts.find((a) => a.subtype === 'cash');
await C('POST', '/accounting/journal', { description: 'Capital', lines: [{ accountId: bank.id, debit: 2000000 }, { accountId: accts.find((a) => a.systemKey === 'owner_capital').id, credit: 2000000 }] });

// ---------- VAT settings
let r = await call('PUT', '/settings/company', { vatRate: 120 });
check('VAT rate over 100 refused', r.status === 400, r.status);
await C('PUT', '/settings/company', { vatRate: 7.5, vatNumber: 'TIN-12345' });
const co = await C('GET', '/settings/company');
check('VAT rate saved', co.vatRate === 7.5 && co.vatNumber === 'TIN-12345', JSON.stringify([co.vatRate, co.vatNumber]));

// ---------- stock
const supp = await C('POST', '/suppliers', { name: 'Grain Co' });
const cust = await C('POST', '/customers', { firstName: 'Bello', lastName: 'Stores' });
const maize = await C('POST', '/products', { name: 'Maize', itemType: 'raw_material', unit: 'kg', cost: 300 });
const flour = await C('POST', '/products', { name: 'Flour 10kg', itemType: 'finished_good', unit: 'bag', price: 5000 });
const p1 = await C('POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 1000, unitCost: 300 }], supplierId: supp.id, paymentStatus: 'unpaid', reference: 'GRN-1', dueDate: new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10) });
const purchases = await C('GET', '/purchases');
const purchase = purchases.find((p) => p.reference === 'GRN-1');
await C('POST', '/production/boms', { productId: flour.id, outputQuantity: 1, lines: [{ componentId: maize.id, quantity: 10 }] });
let mo = await C('POST', '/production/orders', { productId: flour.id, plannedQuantity: 50 });
mo = await C('POST', `/production/orders/${mo.id}/start`, {});
mo = await C('POST', `/production/orders/${mo.id}/complete`, { producedQuantity: 50 });
check('production run 50 bags at 3,000', near(mo.unitCost, 3000), mo.unitCost);

// ---------- VAT on invoices
// 20 bags × 5,000 = 100,000; 10% discount → 90,000; VAT 7.5% → 6,750; total 96,750
let inv = await C('POST', '/invoices', { customerId: cust.id, discountType: 'percent', discountValue: 10, items: [{ productId: flour.id, description: 'Flour', quantity: 20, unitPrice: 5000 }] });
check('VAT defaults to company rate', inv.taxRate === 7.5 && near(inv.taxTotal, 6750) && near(inv.total, 96750), `${inv.taxRate} ${inv.taxTotal} ${inv.total}`);
r = await call('POST', '/invoices', { customerId: cust.id, taxRate: -1, items: [{ productId: flour.id, description: 'x', quantity: 1, unitPrice: 1 }] });
check('negative VAT refused', r.status === 400, r.status);
// Edit draft: VAT 0 for this customer (exempt) then back
let ed = await C('PUT', `/invoices/${inv.id}`, { customerId: cust.id, discountType: 'percent', discountValue: 10, taxRate: 0, items: [{ productId: flour.id, description: 'Flour', quantity: 20, unitPrice: 5000 }] });
check('draft edit to 0% VAT', ed.taxTotal === 0 && near(ed.total, 90000), `${ed.taxTotal} ${ed.total}`);
ed = await C('PUT', `/invoices/${inv.id}`, { customerId: cust.id, discountType: 'percent', discountValue: 10, taxRate: 7.5, items: [{ productId: flour.id, description: 'Flour', quantity: 20, unitPrice: 5000 }] });
check('draft edit back to 7.5%', near(ed.total, 96750));
await C('POST', `/invoices/${inv.id}/finalize`, { payment: { amount: 50000, accountId: bank.id, method: 'bank_transfer' } });
let pl = await C('GET', '/accounting/profit-loss');
check('revenue excludes VAT (90,000)', near(pl.revenue, 90000), pl.revenue);
check('COGS 20 × 3,000', near(pl.cogs, 60000), pl.cogs);
let vat = await C('GET', '/accounting/vat');
check('VAT owed 6,750', near(vat.owed, 6750), vat.owed);
check('VAT charged in period 6,750', near(vat.period.charged, 6750));
check('VAT report lists the invoice', vat.invoices.length === 1 && near(vat.invoices[0].net, 90000) && near(vat.invoices[0].vat, 6750));
let tb = await C('GET', '/accounting/trial-balance');
check('trial balance balanced after VAT sale', tb.balanced);

// Second invoice, then cancel it: VAT reversed
let inv2 = await C('POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 4, unitPrice: 5000 }] });
await C('POST', `/invoices/${inv2.id}/finalize`, {});
vat = await C('GET', '/accounting/vat');
check('VAT owed 6,750 + 1,500', near(vat.owed, 8250), vat.owed);
await C('POST', `/invoices/${inv2.id}/cancel`, {});
vat = await C('GET', '/accounting/vat');
check('cancel reverses VAT', near(vat.owed, 6750) && near(vat.period.reversed, 1500), `${vat.owed} ${vat.period.reversed}`);
pl = await C('GET', '/accounting/profit-loss');
check('revenue back to 90,000 after cancel', near(pl.revenue, 90000), pl.revenue);

// Pay VAT
r = await call('POST', '/accounting/vat/payments', { amount: 9000, accountId: bank.id });
check('cannot pay more VAT than owed', r.status === 400, r.status);
await C('POST', '/accounting/vat/payments', { amount: 6750, accountId: bank.id, reference: 'FIRS-001' });
vat = await C('GET', '/accounting/vat');
check('VAT paid, nothing owed', near(vat.owed, 0) && near(vat.period.paid, 6750) && vat.payments.length === 1, JSON.stringify([vat.owed, vat.period.paid]));
const cf = await C('GET', '/accounting/cash-flow');
const vatLine = (cf.categories || cf.byCategory || []).find?.((c) => c.label === 'VAT paid' || c.category === 'VAT paid');
check('cash flow shows VAT paid', !!vatLine || JSON.stringify(cf).includes('VAT paid'));
tb = await C('GET', '/accounting/trial-balance');
check('trial balance balanced after VAT payment', tb.balanced);

// ---------- customer statement: invoice 96,750, paid 50,000, inv2 20,000+1,500 → cancelled
let st = await C('GET', `/customers/${cust.id}/statement`);
check('customer closing balance 46,750', near(st.closingBalance, 46750), st.closingBalance);
check('customer statement lines', st.lines.length === 4, st.lines.map((l) => l.type).join(','));
check('running balance consistent', st.lines.every((l, i) => near(l.balance, (i ? st.lines[i - 1].balance : st.openingBalance) + l.amount)));
check('customer aging total = open balance', near(st.aging.total, 46750) && st.openDocuments.length === 1, st.aging.total);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
st = await C('GET', `/customers/${cust.id}/statement?from=${tomorrow}`);
check('period after activity: opening = closing', near(st.openingBalance, 46750) && st.lines.length === 0);
r = await call('GET', `/customers/${cust.id}/statement?from=notadate`);
check('bad date refused', r.status === 400, r.status);

// ---------- supplier statement: 300,000 owed, pay 100,000, return 50 kg?
// Maize used 500 kg in production; return 100 kg (30,000) to supplier.
await C('POST', `/purchases/${purchase.id}/pay`, { amount: 100000, accountId: bank.id });
const batches = await C('GET', `/stock/batches/${maize.id}`);
const ret = await call('POST', `/purchases/${purchase.id}/return`, { batchId: batches[0].id, quantity: 100 });
if (ret.status >= 400) console.log('   (return route)', ret.status, ret.message);
let ss = await C('GET', `/suppliers/${supp.id}/statement`);
check('supplier closing 300,000 - 100,000 - 30,000', near(ss.closingBalance, 170000), ss.closingBalance);
check('supplier line types', ss.lines.map((l) => l.type).join(',') === 'purchase,payment,return', ss.lines.map((l) => l.type).join(','));
check('supplier aging: 40+ days overdue bucket', near(ss.aging.d31_60, 170000), JSON.stringify(ss.aging));
const payable = await C('GET', '/accounting/payable');
const owedAp = (payable.purchases || payable.rows || payable).reduce?.((s, p) => s + (p.balance ?? 0), 0);
check('statement agrees with payables', owedAp === undefined || near(owedAp, 170000), owedAp);
r = await call('GET', `/suppliers/00000000-0000-0000-0000-000000000000/statement`);
check('unknown supplier 404', r.status === 404, r.status);

// ---------- reports
const m = await C('GET', '/reports/product-margins');
const fl = m.products.find((p) => p.name === 'Flour 10kg');
check('margin report: flour 20 sold, 90,000 sales, 60,000 cost', fl && fl.quantity === 20 && near(fl.revenue, 90000) && near(fl.cost, 60000) && near(fl.profit, 30000), JSON.stringify(fl));
check('margin % 33.33', fl && near(fl.marginPercent, 33.33), fl?.marginPercent);
check('margin totals = P&L gross profit', near(m.totals.profit, pl.revenue - pl.cogs), `${m.totals.profit} vs ${pl.revenue - pl.cogs}`);
const prod = await C('GET', '/reports/production');
check('production report', prod.completedOrders === 1 && near(prod.totalCost, 150000), JSON.stringify([prod.completedOrders, prod.totalCost]));
const sm = await C('GET', '/reports/stock-movement');
const smM = sm.find((x) => x.name === 'Maize'), smF = sm.find((x) => x.name === 'Flour 10kg');
check('stock movement maize: +1000, -500 production, -100 returned, 400 left', smM && smM.received === 1000 && smM.usedInProduction === -500 && smM.returnedToSupplier === -100 && smM.closing === 400 && smM.opening === 0, JSON.stringify(smM));
check('stock movement flour: +50 produced, -20 sold (cancel restored), 30 left', smF && smF.produced === 50 && smF.sold === -20 && smF.closing === 30, JSON.stringify(smF));
const sm2 = await C('GET', `/reports/stock-movement?from=${tomorrow}`);
const smM2 = sm2.find((x) => x.name === 'Maize');
check('future period: opening = closing = 400', smM2 && smM2.opening === 400 && smM2.closing === 400 && smM2.received === 0, JSON.stringify(smM2));

// ---------- profile
r = await call('PUT', '/auth/me', { firstName: '  ', lastName: 'X' });
check('blank first name refused', r.status === 400, r.status);
const me = await C('PUT', '/auth/me', { firstName: 'Aishat', lastName: 'Bello-Musa' });
check('profile updated', me.firstName === 'Aishat' && me.lastName === 'Bello-Musa');
r = await call('POST', '/auth/change-password', { currentPassword: 'wrong-password', newPassword: 'NewPassword456!' });
check('wrong current password refused', r.status === 400, r.status);
r = await call('POST', '/auth/change-password', { currentPassword: 'Password123!', newPassword: 'short' });
check('short password refused', r.status === 400, r.status);
r = await call('POST', '/auth/change-password', { currentPassword: 'Password123!', newPassword: 'NewPassword456!' });
check('password changed', r.status === 200, r.message);
r = await call('POST', '/auth/login', { email, password: 'Password123!' }, null);
check('old password no longer works', r.status >= 400, r.status);
r = await call('POST', '/auth/login', { email, password: 'NewPassword456!' }, null);
check('new password works', r.status === 200 && !!r.data?.token, r.status);

// ---------- isolation: another company cannot read these statements / VAT
const other = await call('POST', '/auth/register', { firstName: 'O', lastName: 'T', email: `p5o-${Date.now()}@example.test`, password: 'Password123!', company: 'Other' }, null);
r = await call('GET', `/customers/${cust.id}/statement`, null, other.data.token);
check('other company cannot read customer statement', r.status === 404, r.status);
r = await call('GET', '/accounting/vat', null, other.data.token);
check('other company VAT is its own (0)', r.status === 200 && r.data.owed === 0 && r.data.invoices.length === 0);

const ledger = await C('GET', '/accounting/ledger-check');
check('ledger check clean', ledger.ok ?? ledger.balanced ?? (ledger.issues?.length === 0), JSON.stringify(ledger).slice(0, 200));
const sc = await C('GET', '/stock/check');
check('stock check clean', sc.summary.issues === 0 && Math.abs(sc.summary.inventoryAccountDifference) < 0.01, JSON.stringify(sc.summary));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
