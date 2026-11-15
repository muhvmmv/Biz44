// Customer orders and deposits: none, part or full payment up front, held as a
// liability, applied when the order is invoiced, refunded if cancelled.
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
const bal = async (t, key) => (await ok(t, 'GET', '/accounting/accounts')).find((a) => a.systemKey === key)?.balance ?? 0;

const reg = await call(null, 'POST', '/auth/register', { firstName: 'Dp', lastName: 'Admin', email: `dp-${stamp}@example.test`, password: 'Password123!', company: 'Deposit Mills' });
const A = reg.data.token;
await ok(A, 'POST', '/settings/onboarding', { businessType: 'manufacturing', currency: 'NGN' });
const accts = await ok(A, 'GET', '/accounting/accounts');
const bank = accts.find((a) => a.subtype === 'bank');
const bankBal = async () => (await ok(A, 'GET', '/accounting/accounts')).find((a) => a.id === bank.id).balance;
const maize = await ok(A, 'POST', '/products', { name: 'Maize', itemType: 'raw_material', unit: 'kg', cost: 300 });
const flour = await ok(A, 'POST', '/products', { name: 'Flour 10kg', itemType: 'finished_good', unit: 'bag', price: 5000 });
await ok(A, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 2000, unitCost: 300 }], paymentStatus: 'unpaid' });
await ok(A, 'POST', '/production/boms', { productId: flour.id, outputQuantity: 1, lines: [{ componentId: maize.id, quantity: 10 }] });
const cust = await ok(A, 'POST', '/customers', { firstName: 'Hasna', lastName: 'Agrofoods' });
const other = await ok(A, 'POST', '/customers', { firstName: 'Other', lastName: 'Buyer' });

// ---------- order with a part deposit
let r = await call(A, 'POST', '/production/orders', { productId: flour.id, plannedQuantity: 100, deposit: { amount: 1000, accountId: bank.id } });
check('deposit without a customer refused', r.status === 400, r.status);
check('…and no order was created', (await ok(A, 'GET', '/production/orders')).length === 0);
const bank0 = await bankBal();
const mo = await ok(A, 'POST', '/production/orders', { productId: flour.id, plannedQuantity: 100, customerId: cust.id, unitPrice: 5000, deposit: { amount: 200000, accountId: bank.id, method: 'bank_transfer', reference: 'TRF-1' } });
let o = await ok(A, 'GET', `/production/orders/${mo.id}`);
check('order for Hasna: value 500,000, deposit 200,000', o.customer?.id === cust.id && near(o.orderValue, 500000) && near(o.depositsReceived, 200000) && o.deposits.length === 1 && o.deposits[0].number === 'DEP-0001', JSON.stringify([o.orderValue, o.depositsReceived]));
check('bank +200,000', near((await bankBal()) - bank0, 200000));
check('held as Customer Deposits liability, not receivables', near(await bal(A, 'customer_deposits'), 200000) && near(await bal(A, 'ar'), 0));
let pl = await ok(A, 'GET', '/accounting/profit-loss');
check('a deposit is not revenue', near(pl.revenue, 0), pl.revenue);

// Second deposit later
await ok(A, 'POST', '/deposits', { productionOrderId: mo.id, amount: 100000, accountId: bank.id });
o = await ok(A, 'GET', `/production/orders/${mo.id}`);
check('second deposit: 300,000 received', near(o.depositsReceived, 300000) && o.deposits.length === 2);
const list = await ok(A, 'GET', '/production/orders');
check('order list shows the customer and deposits', list[0].customer?.firstName === 'Hasna' && near(list[0].depositsReceived, 300000));

// ---------- make it and invoice it: deposits applied automatically
await ok(A, 'POST', `/production/orders/${mo.id}/start`, {});
await ok(A, 'POST', `/production/orders/${mo.id}/complete`, { producedQuantity: 100 });
r = await call(A, 'POST', '/invoices', { customerId: other.id, productionOrderId: mo.id, taxRate: 0, items: [{ productId: flour.id, description: 'Flour', quantity: 100, unitPrice: 5000 }] });
check('order invoiced to a different customer refused', r.status === 400, r.status);
const inv = await ok(A, 'POST', '/invoices', { customerId: cust.id, productionOrderId: mo.id, taxRate: 0, items: [{ productId: flour.id, description: 'Flour', quantity: 100, unitPrice: 5000 }] });
await ok(A, 'POST', `/invoices/${inv.id}/finalize`, {});
let invNow = await ok(A, 'GET', `/invoices/${inv.id}`);
check('finalize applies 300,000 of deposits', near(invNow.amountPaid, 300000) && invNow.status === 'partially_paid' && invNow.payments.filter((p) => p.method === 'deposit').length === 2, JSON.stringify([invNow.amountPaid, invNow.status]));
check('deposits used up, receivable 200,000', near(await bal(A, 'customer_deposits'), 0) && near(await bal(A, 'ar'), 200000));
pl = await ok(A, 'GET', '/accounting/profit-loss');
check('revenue 500,000 recognised on the invoice', near(pl.revenue, 500000), pl.revenue);
r = await call(A, 'POST', `/invoices/${inv.id}/cancel`, {});
check('invoice paid from a deposit cannot be cancelled', r.status === 400 && /deposit/i.test(r.message), `${r.status} ${r.message}`);
await ok(A, 'POST', `/invoices/${inv.id}/payment`, { amount: 200000, accountId: bank.id });
invNow = await ok(A, 'GET', `/invoices/${inv.id}`);
check('balance paid', invNow.status === 'paid');
o = await ok(A, 'GET', `/production/orders/${mo.id}`);
check('order links to its invoice', o.invoices.length === 1 && o.invoices[0].invoiceNumber === inv.invoiceNumber && near(o.depositsUnused, 0));

// ---------- statement: deposits counted once
let st = await ok(A, 'GET', `/customers/${cust.id}/statement`);
check('statement closes at 0, deposits listed once', near(st.closingBalance, 0) && st.lines.filter((l) => l.type === 'deposit').length === 2 && !st.lines.some((l) => /deposit/i.test(l.description) && l.type === 'payment'), JSON.stringify(st.lines.map((l) => [l.type, l.amount])));

// ---------- full payment up front, then the order is cancelled: refund
const mo2 = await ok(A, 'POST', '/production/orders', { productId: flour.id, plannedQuantity: 10, customerId: cust.id, unitPrice: 5000, deposit: { amount: 50000, accountId: bank.id } });
let o2 = await ok(A, 'GET', `/production/orders/${mo2.id}`);
check('paid in full up front', near(o2.depositsReceived, o2.orderValue));
st = await ok(A, 'GET', `/customers/${cust.id}/statement`);
check('customer is 50,000 in credit', near(st.closingBalance, -50000), st.closingBalance);
await ok(A, 'POST', `/production/orders/${mo2.id}/cancel`, {});
const dep = o2.deposits[0];
r = await call(A, 'POST', `/deposits/${dep.id}/refund`, { amount: 60000, accountId: bank.id });
check('cannot refund more than the deposit', r.status === 400, r.status);
const bankBefore = await bankBal();
const refunded = await ok(A, 'POST', `/deposits/${dep.id}/refund`, { accountId: bank.id });
check('refund pays back 50,000', near(bankBefore - (await bankBal()), 50000) && near(refunded.available, 0));
check('nothing held after refund', near(await bal(A, 'customer_deposits'), 0));
st = await ok(A, 'GET', `/customers/${cust.id}/statement`);
check('statement back to 0', near(st.closingBalance, 0), st.closingBalance);
r = await call(A, 'POST', `/deposits/${dep.id}/refund`, { accountId: bank.id });
check('nothing left to refund', r.status === 400, r.status);
r = await call(A, 'POST', '/deposits', { productionOrderId: mo2.id, amount: 1000, accountId: bank.id });
check('no deposits on a cancelled order', r.status === 400, r.status);

// ---------- a general deposit applied by hand
await ok(A, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 10, unitCost: 3000 }], paymentStatus: 'unpaid' });
const gen = await ok(A, 'POST', '/deposits', { customerId: other.id, amount: 20000, accountId: bank.id });
const inv2 = await ok(A, 'POST', '/invoices', { customerId: other.id, taxRate: 0, items: [{ productId: flour.id, description: 'Flour', quantity: 3, unitPrice: 5000 }] });
await ok(A, 'POST', `/invoices/${inv2.id}/finalize`, {});
r = await call(A, 'POST', `/invoices/${inv.id}/apply-deposit`, { depositId: gen.id });
check("another customer's deposit cannot pay this invoice", r.status === 400, r.status);
const applied = await ok(A, 'POST', `/invoices/${inv2.id}/apply-deposit`, { depositId: gen.id });
check('applies 15,000 (the invoice total)', near(applied.applied, 15000));
const deps = await ok(A, 'GET', `/deposits?customerId=${other.id}`);
check('5,000 of that deposit left', near(deps[0].available, 5000));
const summary = await ok(A, 'GET', `/customers/${other.id}/summary`);
check('customer summary shows 5,000 deposit held', near(summary.summary.depositsHeld, 5000), summary.summary.depositsHeld);

// ---------- roles
const locs = await ok(A, 'GET', '/locations');
const mk = async (role) => {
  const email = `dp-${role}-${stamp}@example.test`;
  await ok(A, 'POST', '/users', { firstName: role, lastName: 'U', email, password: 'Password123!', role, locationIds: [locs[0].id] });
  return (await call(null, 'POST', '/auth/login', { email, password: 'Password123!' })).data.token;
};
const K = await mk('storekeeper');
r = await call(K, 'POST', '/production/orders', { productId: flour.id, plannedQuantity: 5, customerId: cust.id, deposit: { amount: 1000, accountId: bank.id } });
check('storekeeper cannot take a deposit', r.status === 403, r.status);
r = await call(K, 'POST', '/production/orders', { productId: flour.id, plannedQuantity: 5, customerId: cust.id, unitPrice: 5000 });
check('storekeeper can plan a customer order without one', r.status === 201, r.status);
const S = await mk('sales');
r = await call(S, 'POST', '/deposits', { productionOrderId: r.data.id, amount: 5000, accountId: bank.id });
check('sales can record the deposit afterwards', r.status === 201, `${r.status} ${r.message}`);

const tb = await ok(A, 'GET', '/accounting/trial-balance');
check('trial balance balanced', tb.balanced);
const lc = await ok(A, 'GET', '/accounting/ledger-check');
check('ledger check clean', lc.ok ?? lc.balanced ?? true, JSON.stringify(lc).slice(0, 200));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
