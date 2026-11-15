// VAT on purchases and expenses (input VAT): stock valued without VAT, VAT
// recoverable, returned with goods, set off against output VAT, net paid.
const B = process.env.TEST_API_URL || 'http://localhost:4100/api';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${!c ? `  -> ${d}` : ''}`); };
const near = (a, b) => Math.abs(a - b) < 0.011;
async function call(token, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data, message: j.message };
}
const ok = async (t, m, p, b) => { const r = await call(t, m, p, b); if (r.status >= 400) throw new Error(`${m} ${p}: ${r.status} ${r.message}`); return r.data; };
const stamp = Date.now();
const acct = async (t, key) => (await ok(t, 'GET', '/accounting/accounts')).find((a) => a.systemKey === key);

const reg = await call(null, 'POST', '/auth/register', { firstName: 'Iv', lastName: 'Admin', email: `iv-${stamp}@example.test`, password: 'Password123!', company: 'Input VAT Mills' });
const A = reg.data.token;
await ok(A, 'POST', '/settings/onboarding', { businessType: 'manufacturing', currency: 'NGN' });
await ok(A, 'PUT', '/settings/company', { vatRate: 7.5 });
const accts = await ok(A, 'GET', '/accounting/accounts');
const bank = accts.find((a) => a.subtype === 'bank');
await ok(A, 'POST', '/accounting/journal', { description: 'Capital', lines: [{ accountId: bank.id, debit: 2000000 }, { accountId: accts.find((a) => a.systemKey === 'owner_capital').id, credit: 2000000 }] });
const supp = await ok(A, 'POST', '/suppliers', { name: 'Grain Co' });
const maize = await ok(A, 'POST', '/products', { name: 'Maize', itemType: 'raw_material', unit: 'kg', cost: 300 });
const flour = await ok(A, 'POST', '/products', { name: 'Flour 10kg', itemType: 'finished_good', unit: 'bag', price: 5000 });

// ---------- receiving with VAT
let r = await call(A, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 10, unitCost: 100 }], supplierId: supp.id, paymentStatus: 'unpaid', vatAmount: 2000 });
check('VAT above the goods value refused', r.status === 400, r.status);
r = await call(A, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 10, unitCost: 100 }], supplierId: supp.id, paymentStatus: 'unpaid', vatAmount: -5 });
check('negative VAT refused', r.status === 400, r.status);
// 1,000 kg × 300 = 300,000 + VAT 22,500 = 322,500 owed
await ok(A, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 1000, unitCost: 300 }], supplierId: supp.id, paymentStatus: 'unpaid', vatAmount: 22500, reference: 'GRN-V1' });
const purchase = (await ok(A, 'GET', '/purchases')).find((p) => p.reference === 'GRN-V1');
const pDetail = await ok(A, 'GET', `/purchases/${purchase.id}`);
check('purchase: goods 300,000 + VAT 22,500 = 322,500', near(pDetail.subtotal, 300000) && near(pDetail.taxTotal, 22500) && near(pDetail.total, 322500), JSON.stringify([pDetail.subtotal, pDetail.taxTotal, pDetail.total]));
const m1 = await ok(A, 'GET', `/products/${maize.id}`);
check('stock valued without VAT (300,000)', near(m1.totalCostValue, 300000), m1.totalCostValue);
check('raw materials account 300,000', near((await acct(A, 'inventory_raw')).balance, 300000));
check('VAT recoverable 22,500', near((await acct(A, 'vat_input')).balance, 22500));
check('payables 322,500', near((await acct(A, 'ap')).balance, 322500));

// ---------- expense with VAT included
r = await call(A, 'POST', '/accounting/expenses', { amount: 1000, vatAmount: 1000, accountId: bank.id, description: 'x' });
check('expense VAT must be less than the amount', r.status === 400, r.status);
await ok(A, 'POST', '/accounting/expenses', { amount: 10750, vatAmount: 750, accountId: bank.id, description: 'Diesel for generator' });
check('VAT recoverable 23,250 after the expense', near((await acct(A, 'vat_input')).balance, 23250));

// ---------- return 100 kg: 30,000 goods + 2,250 VAT
await ok(A, 'POST', `/purchases/${purchase.id}/return`, { batchId: (await ok(A, 'GET', `/stock/batches/${maize.id}`))[0].id, quantity: 100 });
const pAfter = await ok(A, 'GET', `/purchases/${purchase.id}`);
check('return takes 32,250 off what is owed', near(pAfter.returnedAmount, 32250) && near((await acct(A, 'ap')).balance, 290250), JSON.stringify([pAfter.returnedAmount]));
check('VAT recoverable back to 21,000', near((await acct(A, 'vat_input')).balance, 21000));
check('raw materials 270,000', near((await acct(A, 'inventory_raw')).balance, 270000));
const ss = await ok(A, 'GET', `/suppliers/${supp.id}/statement`);
check('supplier statement closes at 290,250', near(ss.closingBalance, 290250), ss.closingBalance);

// ---------- sales with output VAT: 100 bags × 5,000 → VAT 37,500
await ok(A, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 100, unitCost: 3000 }], paymentStatus: 'paid', paymentAccountId: bank.id });
const cust = await ok(A, 'POST', '/customers', { firstName: 'Bello', lastName: 'Stores' });
const inv = await ok(A, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 100, unitPrice: 5000 }] });
await ok(A, 'POST', `/invoices/${inv.id}/finalize`, {});

let vat = await ok(A, 'GET', '/accounting/vat');
check('VAT report: output 37,500, recoverable 21,000, net due 16,500', near(vat.owed, 37500) && near(vat.recoverable, 21000) && near(vat.netDue, 16500), JSON.stringify([vat.owed, vat.recoverable, vat.netDue]));
check('VAT report: input paid 23,250, returned 2,250, net 21,000', near(vat.period.inputPaid, 23250) && near(vat.period.inputReversed, 2250) && near(vat.period.inputNet, 21000), JSON.stringify(vat.period));
check('VAT for period 37,500 − 21,000 = 16,500', near(vat.period.netForPeriod, 16500));

// ---------- set off and pay the net
r = await call(A, 'POST', '/accounting/vat/offset', { amount: 30000 });
check('cannot set off more than recoverable', r.status === 400, r.status);
await ok(A, 'POST', '/accounting/vat/offset', {});
vat = await ok(A, 'GET', '/accounting/vat');
check('after set-off: owe 16,500, nothing recoverable', near(vat.owed, 16500) && near(vat.recoverable, 0) && near(vat.period.offset, 21000), JSON.stringify([vat.owed, vat.recoverable, vat.period.offset]));
r = await call(A, 'POST', '/accounting/vat/offset', {});
check('nothing more to set off', r.status === 400, r.status);
await ok(A, 'POST', '/accounting/vat/payments', { amount: 16500, accountId: bank.id, reference: 'FIRS-Q4' });
vat = await ok(A, 'GET', '/accounting/vat');
check('VAT settled', near(vat.owed, 0) && near(vat.netDue, 0));

// ---------- costs exclude VAT
const pl = await ok(A, 'GET', '/accounting/profit-loss');
check('P&L: revenue 500,000, COGS 300,000, expenses 10,000 (no VAT)', near(pl.revenue, 500000) && near(pl.cogs, 300000) && near(pl.totalOpex, 10000), JSON.stringify([pl.revenue, pl.cogs, pl.totalOpex]));
const tb = await ok(A, 'GET', '/accounting/trial-balance');
check('trial balance balanced', tb.balanced);
const sc = await ok(A, 'GET', '/stock/check');
check('stock check clean', sc.summary.issues === 0 && Math.abs(sc.summary.inventoryAccountDifference) < 0.01, JSON.stringify(sc.summary));

// ---------- paying the supplier in full clears the purchase
await ok(A, 'POST', `/purchases/${purchase.id}/pay`, { amount: 290250, accountId: bank.id });
check('purchase paid', (await ok(A, 'GET', `/purchases/${purchase.id}`)).status === 'paid');
check('payables 0', near((await acct(A, 'ap')).balance, 0));

// ---------- a storekeeper can record VAT on goods received on credit
const locs = await ok(A, 'GET', '/locations');
const email = `iv-k-${stamp}@example.test`;
await ok(A, 'POST', '/users', { firstName: 'K', lastName: 'K', email, password: 'Password123!', role: 'storekeeper', locationIds: [locs[0].id] });
const K = (await call(null, 'POST', '/auth/login', { email, password: 'Password123!' })).data.token;
r = await call(K, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 10, unitCost: 300 }], supplierId: supp.id, paymentStatus: 'unpaid', vatAmount: 225 });
check('storekeeper receives with VAT on credit', r.status === 201 || r.status === 200, `${r.status} ${r.message}`);
r = await call(K, 'POST', '/accounting/vat/offset', {});
check('storekeeper cannot touch VAT accounts', r.status === 403, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
