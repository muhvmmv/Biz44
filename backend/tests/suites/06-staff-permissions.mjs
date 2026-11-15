// Staff accounts and role permissions: what each role can and cannot do,
// deactivation and role changes taking effect at once, admin safeguards.
const B = process.env.TEST_API_URL || 'http://localhost:4100/api';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${!c ? `  -> ${d}` : ''}`); };
async function call(token, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data, message: j.message };
}
const ok = async (token, m, p, b) => { const r = await call(token, m, p, b); if (r.status >= 400) throw new Error(`${m} ${p}: ${r.status} ${r.message}`); return r.data; };
const stamp = Date.now();

// ---------- company + admin
const reg = await call(null, 'POST', '/auth/register', { firstName: 'Ada', lastName: 'Admin', email: `perm-admin-${stamp}@example.test`, password: 'Password123!', company: 'Perm Mills' });
const A = reg.data.token;
check('admin sees full permissions at sign-in', reg.data.user.permissions?.settings === 'write' && reg.data.user.permissions?.money === 'write', JSON.stringify(reg.data.user.permissions));
await ok(A, 'POST', '/settings/onboarding', { businessType: 'manufacturing', currency: 'NGN' });
const locations = await ok(A, 'GET', '/locations');
const loc = locations[0].id;
const accts = await ok(A, 'GET', '/accounting/accounts');
const bank = accts.find((a) => a.subtype === 'bank');
await ok(A, 'POST', '/accounting/journal', { description: 'Capital', lines: [{ accountId: bank.id, debit: 1000000 }, { accountId: accts.find((a) => a.systemKey === 'owner_capital').id, credit: 1000000 }] });
const flour = await ok(A, 'POST', '/products', { name: 'Flour 10kg', itemType: 'finished_good', unit: 'bag', price: 5000 });
const maize = await ok(A, 'POST', '/products', { name: 'Maize', itemType: 'raw_material', unit: 'kg', cost: 300 });
await ok(A, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 100, unitCost: 3000 }, { productId: maize.id, quantity: 500, unitCost: 300 }], paymentStatus: 'paid', paymentAccountId: bank.id });
const cust = await ok(A, 'POST', '/customers', { firstName: 'Bello', lastName: 'Stores' });
const supp = await ok(A, 'POST', '/suppliers', { name: 'Grain Co' });
await ok(A, 'POST', '/production/boms', { productId: flour.id, outputQuantity: 1, lines: [{ componentId: maize.id, quantity: 10 }] });

// ---------- adding staff: validation
const base = { firstName: 'Sam', lastName: 'Sales', password: 'Password123!', locationIds: [loc] };
let r = await call(A, 'POST', '/users', { ...base, email: 'not-an-email', role: 'sales' });
check('bad email refused', r.status === 400, r.status);
r = await call(A, 'POST', '/users', { ...base, email: `x-${stamp}@example.test`, role: 'owner' });
check('unknown role refused', r.status === 400, r.status);
r = await call(A, 'POST', '/users', { ...base, email: `x-${stamp}@example.test`, role: 'sales', password: 'short' });
check('short password refused', r.status === 400, r.status);
r = await call(A, 'POST', '/users', { ...base, email: `x-${stamp}@example.test`, role: 'sales', locationIds: [] });
check('no location refused', r.status === 400, r.status);
r = await call(A, 'POST', '/users', { ...base, email: `perm-admin-${stamp}@example.test`, role: 'sales' });
check('email already used refused', r.status === 400, r.status);

const mk = async (role, first) => {
  const email = `perm-${role}-${stamp}@example.test`;
  const u = await ok(A, 'POST', '/users', { ...base, firstName: first, email: email.toUpperCase(), role });
  const login = await call(null, 'POST', '/auth/login', { email, password: 'Password123!' });
  return { user: u, token: login.data?.token, me: login.data?.user };
};
const sales = await mk('sales', 'Sam');
const store = await mk('storekeeper', 'Stella');
const acct = await mk('accountant', 'Ama');
check('staff can sign in (email any case)', !!sales.token && !!store.token && !!acct.token);
check('staff gets its location', sales.user.locations.length === 1 && sales.user.locations[0].id === loc);
check('sales permissions sent at sign-in', sales.me.permissions.sales === 'write' && !sales.me.permissions.money, JSON.stringify(sales.me.permissions));
const team = await ok(A, 'GET', '/users');
check('team lists 4 people', team.length === 4, team.length);

// ---------- sales role
const S = sales.token;
const inv = await ok(S, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 5, unitPrice: 5000 }] });
r = await call(S, 'POST', `/invoices/${inv.id}/finalize`, { payment: { amount: 10000, accountId: bank.id } });
check('sales: create + finalize invoice with payment', r.status === 200, r.message);
check('sales: can list payment accounts', (await call(S, 'GET', '/accounting/payment-accounts')).status === 200);
check('sales: can see receivables', (await call(S, 'GET', '/accounting/receivable')).status === 200);
check('sales: can read products', (await call(S, 'GET', '/products')).status === 200);
for (const [m, p, b, label] of [
  ['GET', '/accounting/accounts', null, 'chart of accounts'],
  ['GET', '/accounting/vat', null, 'VAT'],
  ['GET', '/accounting/profit-loss', null, 'P&L'],
  ['POST', '/accounting/journal', { description: 'x', lines: [] }, 'manual journal'],
  ['POST', '/products', { name: 'X' }, 'create product'],
  ['POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 1, unitCost: 1 }], paymentStatus: 'unpaid' }, 'receive goods'],
  ['GET', '/suppliers', null, 'suppliers'],
  ['GET', '/employees', null, 'employees'],
  ['GET', '/payroll', null, 'payroll'],
  ['GET', '/reports/product-margins', null, 'reports'],
  ['GET', '/dashboard/monthly-chart', null, 'profit chart'],
  ['POST', '/users', { ...base, email: `y-${stamp}@example.test`, role: 'admin' }, 'add users'],
  ['PUT', '/settings/company', { vatRate: 50 }, 'company settings'],
  ['POST', '/production/orders', { productId: flour.id, plannedQuantity: 1 }, 'production'],
]) {
  r = await call(S, m, p, b);
  check(`sales: blocked from ${label}`, r.status === 403, `${r.status} ${r.message}`);
}
const sum = await ok(S, 'GET', '/dashboard/summary');
check('sales dashboard: no profit or cash figures', sum.revenue === null && sum.netProfit === null && sum.totalCash === null && sum.cashAccounts === null, JSON.stringify([sum.revenue, sum.totalCash]));
check('sales dashboard: keeps receivables and stock', sum.outstanding !== null && sum.lowStock !== null && sum.supplierOutstanding === null);
const alerts = await ok(S, 'GET', '/dashboard/alerts');
check('sales alerts: none about cash or suppliers', alerts.every((a) => !['cash-negative', 'suppliers-overdue'].includes(a.id)));
check('sales: can still read company settings (currency)', (await call(S, 'GET', '/settings/company')).status === 200);

// ---------- storekeeper
const K = store.token;
r = await call(K, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 200, unitCost: 310 }], supplierId: supp.id, paymentStatus: 'unpaid', reference: 'GRN-K1' });
check('storekeeper: receive goods on credit', r.status === 201 || r.status === 200, `${r.status} ${r.message}`);
r = await call(K, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 1, unitCost: 310 }], paymentStatus: 'paid', paymentAccountId: bank.id });
check('storekeeper: cannot pay on receipt', r.status === 403, `${r.status} ${r.message}`);
let mo = await call(K, 'POST', '/production/orders', { productId: flour.id, plannedQuantity: 10 });
check('storekeeper: plans production', mo.status === 201 || mo.status === 200, mo.message);
r = await call(K, 'POST', `/production/orders/${mo.data.id}/start`, {});
check('storekeeper: starts production', r.status === 200, r.message);
check('storekeeper: reads invoices', (await call(K, 'GET', '/invoices')).status === 200);
r = await call(K, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'x', quantity: 1, unitPrice: 1 }] });
check('storekeeper: cannot invoice', r.status === 403, r.status);
const purchases = await ok(K, 'GET', '/purchases');
const grn = purchases.find((p) => p.reference === 'GRN-K1');
r = await call(K, 'POST', `/purchases/${grn.id}/pay`, { amount: 1000, accountId: bank.id });
check('storekeeper: cannot pay supplier', r.status === 403, r.status);
check('storekeeper: sees payables', (await call(K, 'GET', '/accounting/payable')).status === 200);
check('storekeeper: stock movement report', (await call(K, 'GET', '/reports/stock-movement')).status === 200);
check('storekeeper: no cash accounts', (await call(K, 'GET', '/accounting/accounts')).status === 403);

// ---------- accountant
const C = acct.token;
r = await call(C, 'POST', `/purchases/${grn.id}/pay`, { amount: 12000, accountId: bank.id });
check('accountant: pays supplier', r.status === 200, `${r.status} ${r.message}`);
check('accountant: reads P&L', (await call(C, 'GET', '/accounting/profit-loss')).status === 200);
r = await call(C, 'POST', '/stock/adjust', { productId: maize.id, quantity: 5, reason: 'x' });
check('accountant: cannot adjust stock', r.status === 403, r.status);
r = await call(C, 'POST', '/products', { name: 'Y' });
check('accountant: cannot create products', r.status === 403, r.status);
check('accountant: reads products', (await call(C, 'GET', '/products')).status === 200);
r = await call(C, 'GET', '/users');
check('accountant: can see the team', r.status === 200);
r = await call(C, 'PUT', `/users/${sales.user.id}`, { role: 'admin' });
check('accountant: cannot change roles', r.status === 403, r.status);

// ---------- role change applies at once (same token)
await ok(A, 'PUT', `/users/${sales.user.id}`, { role: 'manager' });
check('promoted to manager: P&L now allowed with the same token', (await call(S, 'GET', '/accounting/profit-loss')).status === 200);
await ok(A, 'PUT', `/users/${sales.user.id}`, { role: 'sales' });
check('back to sales: P&L blocked again', (await call(S, 'GET', '/accounting/profit-loss')).status === 403);

// ---------- deactivation
await ok(A, 'PUT', `/users/${store.user.id}`, { isActive: false });
r = await call(K, 'GET', '/products');
check('deactivated: existing token rejected', r.status === 401, r.status);
r = await call(null, 'POST', '/auth/login', { email: `perm-storekeeper-${stamp}@example.test`, password: 'Password123!' });
check('deactivated: cannot sign in', r.status >= 400 && /deactivated/i.test(r.message || ''), `${r.status} ${r.message}`);
await ok(A, 'PUT', `/users/${store.user.id}`, { isActive: true });
r = await call(null, 'POST', '/auth/login', { email: `perm-storekeeper-${stamp}@example.test`, password: 'Password123!' });
check('reactivated: can sign in again', r.status === 200);

// ---------- admin safeguards
const me = team.find((u) => u.role === 'admin');
r = await call(A, 'PUT', `/users/${me.id}`, { role: 'sales' });
check('admin cannot demote themself', r.status === 400, r.status);
r = await call(A, 'PUT', `/users/${me.id}`, { isActive: false });
check('admin cannot deactivate themself', r.status === 400, r.status);
await ok(A, 'PUT', `/users/${acct.user.id}`, { role: 'admin' });
const A2 = acct.token;
r = await call(A2, 'PUT', `/users/${me.id}`, { role: 'manager' });
check('a second admin can demote the first', r.status === 200, r.message);
r = await call(A2, 'PUT', `/users/${acct.user.id}`, { role: 'manager' });
check('the last admin cannot demote themself', r.status === 400, r.status);
r = await call(A, 'POST', '/users', { ...base, email: `z-${stamp}@example.test`, role: 'sales' });
check('demoted first admin can no longer add users', r.status === 403, r.status);
await ok(A2, 'PUT', `/users/${me.id}`, { role: 'admin' });

// ---------- password reset by admin
await ok(A, 'POST', `/users/${sales.user.id}/password`, { password: 'Reset-4567' });
r = await call(null, 'POST', '/auth/login', { email: `perm-sales-${stamp}@example.test`, password: 'Reset-4567' });
check('admin password reset works', r.status === 200);

// ---------- locations restrict staff
const loc2 = await ok(A, 'POST', '/locations', { name: `Store ${stamp}`, type: 'store' });
const L2 = loc2.id ?? loc2.location?.id;
r = await call(S, 'GET', `/products?locationId=${L2}`);
check('staff cannot open a location they are not given', r.status === 403, r.status);
await ok(A, 'PUT', `/users/${sales.user.id}`, { locationIds: [loc, L2] });
r = await call(S, 'GET', `/products?locationId=${L2}`);
check('after access is given, they can', r.status === 200, r.status);

// ---------- isolation
const other = await call(null, 'POST', '/auth/register', { firstName: 'O', lastName: 'T', email: `perm-other-${stamp}@example.test`, password: 'Password123!', company: 'Other' });
r = await call(other.data.token, 'PUT', `/users/${sales.user.id}`, { role: 'admin' });
check('another company cannot change our staff', r.status === 404, r.status);
r = await call(other.data.token, 'GET', '/users');
check("another company's team is only itself", r.data.length === 1);
r = await call(A, 'POST', '/users', { ...base, email: `w-${stamp}@example.test`, role: 'sales', locationIds: [(await call(other.data.token, 'GET', '/locations')).data[0].id] });
check("cannot give access to another company's location", r.status === 400, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
