// Branches are factories or stores; stores cannot run production.
const B = process.env.TEST_API_URL || 'http://localhost:4100/api';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${!c ? `  -> ${d}` : ''}`); };
const reg = await (await fetch(B + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ firstName: 'Br', lastName: 'Owner', email: `branch-${Date.now()}@example.test`, password: 'Password123!', company: 'Branch Test' }) })).json();
const T = reg.data.token;
async function C(method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); return { status: r.status, data: j.data, message: j.message };
}

const main = (await C('GET', '/locations')).data[0];
check('existing branch is a factory', main.kind === 'factory', main.kind);

let r = await C('POST', '/locations', { name: 'Kano store', kind: 'warehouse' });
check('unknown kind refused', r.status === 400, r.status);
r = await C('POST', '/locations', { name: 'Old client branch' });
check('kind defaults to factory', r.status === 201 && r.data.kind === 'factory', JSON.stringify(r.data));
const store = (await C('POST', '/locations', { name: 'Kano store', kind: 'store', city: 'Kano' })).data;
check('store created', store?.kind === 'store', JSON.stringify(store));

// A product with a bill of materials, and stock at the factory.
const bags = (await C('POST', '/products', { name: 'Bag', itemType: 'packaging', unit: 'pcs', cost: 10 })).data;
const flour = (await C('POST', '/products', { name: 'Flour', itemType: 'finished_good', unit: 'pcs', price: 500 })).data;
await C('POST', '/production/boms', { productId: flour.id, outputQuantity: 1, lines: [{ componentId: bags.id, quantity: 1 }] });

r = await C('POST', `/production/orders?locationId=${store.id}`, { productId: flour.id, plannedQuantity: 5 });
check('production order at a store refused', r.status === 400 && /store/.test(r.message), `${r.status} ${r.message}`);
const order = await C('POST', `/production/orders?locationId=${main.id}`, { productId: flour.id, plannedQuantity: 5 });
check('production order at a factory allowed', order.status === 201, `${order.status} ${order.message}`);

r = await C('PUT', `/locations/${main.id}`, { kind: 'store' });
check('factory with planned production cannot become a store', r.status === 400 && /production order/.test(r.message), `${r.status} ${r.message}`);
await C('POST', `/production/orders/${order.data.id}/cancel`);
r = await C('PUT', `/locations/${main.id}`, { kind: 'store' });
check('factory becomes a store once nothing is planned', r.status === 200 && r.data.kind === 'store', `${r.status} ${r.message}`);
r = await C('PUT', `/locations/${main.id}`, { kind: 'factory' });
check('store becomes a factory again', r.status === 200 && r.data.kind === 'factory', `${r.status} ${r.message}`);
r = await C('PUT', `/locations/${main.id}`, { kind: 'shop' });
check('invalid kind on edit refused', r.status === 400, r.status);
r = await C('PUT', `/locations/${main.id}`, { city: 'Kaduna' });
check('editing other fields keeps the kind', r.status === 200 && r.data.kind === 'factory' && r.data.city === 'Kaduna', JSON.stringify(r.data));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
