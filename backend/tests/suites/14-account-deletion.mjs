// Account deletion: a person's details are erased while the books stay;
// an administrator can delete the whole company, and nothing else is touched.
const B = process.env.TEST_API_URL || 'http://localhost:4100/api';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${!c ? `  -> ${d}` : ''}`); };
const stamp = Date.now();
async function call(token, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); return { status: r.status, data: j.data, message: j.message };
}
async function ok(token, method, path, body) {
  const r = await call(token, method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${r.message}`);
  return r.data;
}
const register = async (prefix, company) => {
  const email = `${prefix}-${stamp}@example.test`;
  const d = await ok(null, 'POST', '/auth/register', { firstName: 'Owner', lastName: prefix, email, password: 'Password123!', company });
  return { token: d.token, email, user: d.user };
};

// ---------- company A with a full set of records
const A = await register('erase-a', 'Erase Mills');
const other = await register('erase-b', 'Untouched Foods');
const loc = (await ok(A.token, 'GET', '/locations'))[0];
const accts = await ok(A.token, 'GET', '/accounting/accounts');
const bank = accts.find((a) => a.subtype === 'bank');
await ok(A.token, 'POST', '/accounting/journal', { description: 'Capital', lines: [{ accountId: bank.id, debit: 5000000 }, { accountId: accts.find((a) => a.systemKey === 'owner_capital').id, credit: 5000000 }] });
const flour = await ok(A.token, 'POST', '/products', { name: 'Flour', itemType: 'finished_good', unit: 'bag', price: 5000 });
const maize = await ok(A.token, 'POST', '/products', { name: 'Maize', itemType: 'raw_material', unit: 'kg', cost: 300 });
const supp = await ok(A.token, 'POST', '/suppliers', { name: 'Grain Co' });
const cust = await ok(A.token, 'POST', '/customers', { firstName: 'Bello', lastName: 'Stores' });
await ok(A.token, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 1000, unitCost: 300 }, { productId: flour.id, quantity: 50, unitCost: 3000 }], supplierId: supp.id, paymentStatus: 'unpaid', reference: 'GRN-1' });
await ok(A.token, 'POST', '/production/boms', { productId: flour.id, outputQuantity: 1, lines: [{ componentId: maize.id, quantity: 10 }] });
const mo = await ok(A.token, 'POST', '/production/orders', { productId: flour.id, plannedQuantity: 20, customerId: cust.id, unitPrice: 5000, deposit: { amount: 20000, accountId: bank.id } });
await ok(A.token, 'POST', `/production/orders/${mo.id}/start`, {});
await ok(A.token, 'POST', `/production/orders/${mo.id}/complete`, { producedQuantity: 20 });
const inv = await ok(A.token, 'POST', '/invoices', { customerId: cust.id, productionOrderId: mo.id, taxRate: 0, items: [{ productId: flour.id, description: 'Flour', quantity: 20, unitPrice: 5000 }] });
await ok(A.token, 'POST', `/invoices/${inv.id}/finalize`, { payment: { amount: 30000, accountId: bank.id } });
await ok(A.token, 'POST', `/invoices/${inv.id}/credit-notes`, { items: [{ invoiceItemId: inv.items[0].id, quantity: 1, restock: true }] });
const store = await ok(A.token, 'POST', '/locations', { name: 'Kano store', kind: 'store' });
await ok(A.token, 'POST', '/stock-transfers', { fromLocationId: loc.id, toLocationId: store.id, items: [{ productId: flour.id, quantity: 10 }] });
await ok(A.token, 'POST', '/employees', { firstName: 'Ade', lastName: 'Miller', salary: 1000 });
const run = await ok(A.token, 'POST', `/payroll/run?locationId=${loc.id}`, { period: '2026-11', deductionRate: 10 });
await ok(A.token, 'POST', `/payroll/${run[0].id}/pay?locationId=${loc.id}`, { accountId: bank.id });

// ---------- staff member deletes their own account
const staffEmail = `erase-staff-${stamp}@example.test`;
const staff = await ok(A.token, 'POST', '/users', { firstName: 'Sam', lastName: 'Sales', email: staffEmail, password: 'Password123!', role: 'sales', locationIds: [loc.id] });
const S = (await ok(null, 'POST', '/auth/login', { email: staffEmail, password: 'Password123!' })).token;
const staffInv = await ok(S, 'POST', '/invoices', { customerId: cust.id, taxRate: 0, items: [{ productId: flour.id, description: 'Flour', quantity: 1, unitPrice: 5000 }] });

let r = await call(S, 'POST', '/auth/delete-account', {});
check('password is required', r.status === 400, r.status);
r = await call(S, 'POST', '/auth/delete-account', { password: 'wrong-one' });
check('wrong password refused', r.status === 400 && /not correct/.test(r.message), `${r.status} ${r.message}`);
r = await call(S, 'POST', '/auth/delete-account', { password: 'Password123!', deleteCompany: true, companyName: 'Erase Mills' });
check('staff cannot delete the company', r.status === 403, r.status);
const tbBefore = await ok(A.token, 'GET', '/accounting/ledger-check');
r = await call(S, 'POST', '/auth/delete-account', { password: 'Password123!' });
check('staff account deleted', r.status === 200 && r.data?.deleted === 'user', `${r.status} ${r.message}`);
check('the old session stops working', (await call(S, 'GET', '/auth/me')).status === 401);
check('cannot sign in any more', (await call(null, 'POST', '/auth/login', { email: staffEmail, password: 'Password123!' })).status === 401);
const team = await ok(A.token, 'GET', '/users');
check('no longer listed in the team', !team.some((u) => u.id === staff.id), JSON.stringify(team.map((u) => u.email)));
check('nothing in the team shows their name or email', !JSON.stringify(team).includes(staffEmail));
check('the invoice they made is still there', (await call(A.token, 'GET', `/invoices/${staffInv.id}`)).status === 200);
const tbAfter = await ok(A.token, 'GET', '/accounting/ledger-check');
check('the books are unchanged', tbAfter.balanced && JSON.stringify(tbAfter) === JSON.stringify(tbBefore), JSON.stringify([tbBefore, tbAfter]));
r = await call(A.token, 'PUT', `/users/${staff.id}`, { isActive: true });
check('a deleted account cannot be switched back on', r.status === 404, r.status);
r = await call(null, 'POST', '/auth/register', { firstName: 'Sam', lastName: 'Again', email: staffEmail, password: 'Password123!', company: 'Sam Co' });
check('the email can be used again', r.status === 201, `${r.status} ${r.message}`);

// ---------- the only administrator
r = await call(A.token, 'POST', '/auth/delete-account', { password: 'Password123!' });
check('the only person must delete the company instead', r.status === 400 && /delete the company/.test(r.message), `${r.status} ${r.message}`);
const m2Email = `erase-mgr-${stamp}@example.test`;
await ok(A.token, 'POST', '/users', { firstName: 'Mo', lastName: 'Manager', email: m2Email, password: 'Password123!', role: 'manager', locationIds: [loc.id] });
r = await call(A.token, 'POST', '/auth/delete-account', { password: 'Password123!' });
check('the only administrator must hand over first', r.status === 400 && /only administrator/.test(r.message), `${r.status} ${r.message}`);
r = await call(A.token, 'POST', '/auth/delete-account', { password: 'Password123!', deleteCompany: true, companyName: 'Wrong name' });
check('company name must match', r.status === 400 && /company name/.test(r.message), `${r.status} ${r.message}`);
check('…and nothing was deleted', (await call(A.token, 'GET', `/invoices/${inv.id}`)).status === 200);

// ---------- delete the whole company
r = await call(A.token, 'POST', '/auth/delete-account', { password: 'Password123!', deleteCompany: true, companyName: '  erase mills ' });
check('company deleted', r.status === 200 && r.data?.deleted === 'company', `${r.status} ${r.message}`);
check('owner cannot sign in', (await call(null, 'POST', '/auth/login', { email: A.email, password: 'Password123!' })).status === 401);
check('other team members cannot sign in', (await call(null, 'POST', '/auth/login', { email: m2Email, password: 'Password123!' })).status === 401);
check('old session stops working', (await call(A.token, 'GET', '/invoices')).status === 401);
const b = await call(other.token, 'GET', '/auth/me');
check('another company is untouched', b.status === 200 && b.data?.companyName === 'Untouched Foods', JSON.stringify(b));
check('…and its books still balance', (await ok(other.token, 'GET', '/accounting/ledger-check')).balanced === true);
r = await call(null, 'POST', '/auth/register', { firstName: 'Owner', lastName: 'Again', email: A.email, password: 'Password123!', company: 'Erase Mills' });
check('the owner can start again with the same email', r.status === 201, `${r.status} ${r.message}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
