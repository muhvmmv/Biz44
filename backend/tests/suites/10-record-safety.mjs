// Records with history cannot be deleted; suppliers list shows what is owed.
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

const reg = await call(null, 'POST', '/auth/register', { firstName: 'Rs', lastName: 'Admin', email: `rs-${stamp}@example.test`, password: 'Password123!', company: 'Safety Mills' });
const A = reg.data.token;
await ok(A, 'POST', '/settings/onboarding', { businessType: 'manufacturing', currency: 'NGN' });
const maize = await ok(A, 'POST', '/products', { name: 'Maize', itemType: 'raw_material', unit: 'kg', cost: 300 });
const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);

// Supplier with a delivery
const supp = await ok(A, 'POST', '/suppliers', { name: 'Grain Co' });
await ok(A, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 100, unitCost: 300 }], supplierId: supp.id, paymentStatus: 'unpaid', dueDate: past });
await ok(A, 'POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 10, unitCost: 300 }], supplierId: supp.id, paymentStatus: 'unpaid' });
const list = await ok(A, 'GET', '/suppliers');
const row = list.find((s) => s.id === supp.id);
check('suppliers list: owed 33,000, overdue 30,000', row && near(row.owed, 33000) && near(row.overdue, 30000), JSON.stringify(row));
let r = await call(A, 'DELETE', `/suppliers/${supp.id}`);
check('supplier with deliveries cannot be deleted', r.status === 400 && /deliveries/.test(r.message), `${r.status} ${r.message}`);
const empty = await ok(A, 'POST', '/suppliers', { name: 'Unused Co' });
r = await call(A, 'DELETE', `/suppliers/${empty.id}`);
check('unused supplier can be deleted', r.status === 200, r.status);

// Customer with an invoice
const cust = await ok(A, 'POST', '/customers', { firstName: 'Bello', lastName: 'Stores' });
await ok(A, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: null, description: 'Service', quantity: 1, unitPrice: 100 }] });
r = await call(A, 'DELETE', `/customers/${cust.id}`);
check('customer with invoices cannot be deleted', r.status === 400 && /invoices/.test(r.message), `${r.status} ${r.message}`);
const c2 = await ok(A, 'POST', '/customers', { firstName: 'Walk', lastName: 'In' });
r = await call(A, 'DELETE', `/customers/${c2.id}`);
check('customer without invoices can be deleted', r.status === 200, r.status);

// Employee with payroll
const emp = await ok(A, 'POST', '/employees', { firstName: 'Ali', lastName: 'Musa', salary: 80000, position: 'Mill operator' });
await ok(A, 'POST', '/payroll/run', { period: '2026-10' });
r = await call(A, 'DELETE', `/employees/${emp.id}`);
check('employee with payroll cannot be deleted', r.status === 400 && /payroll/.test(r.message), `${r.status} ${r.message}`);
const e2 = await ok(A, 'POST', '/employees', { firstName: 'New', lastName: 'Hire', salary: 50000 });
r = await call(A, 'DELETE', `/employees/${e2.id}`);
check('employee without records can be deleted', r.status === 200, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
