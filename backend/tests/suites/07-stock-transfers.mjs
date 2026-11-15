// Stock transfers between locations: cost layers and history carried over,
// value unchanged, all-or-nothing, location access and role checks.
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

const reg = await call(null, 'POST', '/auth/register', { firstName: 'Tr', lastName: 'Admin', email: `tr-${stamp}@example.test`, password: 'Password123!', company: 'Transfer Mills' });
const A = reg.data.token;
await ok(A, 'POST', '/settings/onboarding', { businessType: 'manufacturing', currency: 'NGN' });
const factory = (await ok(A, 'GET', '/locations'))[0];
const storeRes = await ok(A, 'POST', '/locations', { name: 'Kano Store', type: 'store' });
const store = storeRes.id ? storeRes : storeRes.location;
const accts = await ok(A, 'GET', '/accounting/accounts');
const bank = accts.find((a) => a.subtype === 'bank');
await ok(A, 'POST', '/accounting/journal', { description: 'Capital', lines: [{ accountId: bank.id, debit: 2000000 }, { accountId: accts.find((a) => a.systemKey === 'owner_capital').id, credit: 2000000 }] });
const supp = await ok(A, 'POST', '/suppliers', { name: 'Flour Co' });
const flour = await ok(A, 'POST', '/products', { name: 'Flour 10kg', itemType: 'finished_good', unit: 'bag', price: 5000 });
const bags = await ok(A, 'POST', '/products', { name: 'Empty bag', itemType: 'packaging', unit: 'pcs', cost: 20 });
// Two deliveries at the factory: 100 @ 3,000 then 50 @ 3,200
await ok(A, 'POST', `/stock/receive?locationId=${factory.id}`, { items: [{ productId: flour.id, quantity: 100, unitCost: 3000 }], supplierId: supp.id, paymentStatus: 'paid', paymentAccountId: bank.id, reference: 'GRN-A' });
await new Promise((r) => setTimeout(r, 20));
await ok(A, 'POST', `/stock/receive?locationId=${factory.id}`, { items: [{ productId: flour.id, quantity: 50, unitCost: 3200 }, { productId: bags.id, quantity: 10, unitCost: 20 }], supplierId: supp.id, paymentStatus: 'paid', paymentAccountId: bank.id, reference: 'GRN-B' });
const bsBefore = await ok(A, 'GET', '/accounting/balance-sheet');
const flourBefore = await ok(A, 'GET', `/products/${flour.id}?locationId=all`);

// ---------- validation
let r = await call(A, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: factory.id, items: [{ productId: flour.id, quantity: 1 }] });
check('same location refused', r.status === 400, r.status);
r = await call(A, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: store.id, items: [] });
check('no items refused', r.status === 400, r.status);
r = await call(A, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: store.id, items: [{ productId: flour.id, quantity: -2 }] });
check('negative quantity refused', r.status === 400, r.status);
// All-or-nothing: the flour line is fine, the bags line is too big.
r = await call(A, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: store.id, items: [{ productId: flour.id, quantity: 10 }, { productId: bags.id, quantity: 999 }] });
check('not enough stock refused', r.status === 400 && /Insufficient stock/.test(r.message), `${r.status} ${r.message}`);
let fLevels = await ok(A, 'GET', `/stock/levels/${flour.id}`);
check('failed transfer moved nothing', fLevels.find((l) => l.locationId === factory.id)?.quantity === 150 && !(fLevels.find((l) => l.locationId === store.id)?.quantity), JSON.stringify(fLevels));

// ---------- transfer 120 bags: 100 @ 3,000 + 20 @ 3,200
const tr = await ok(A, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: store.id, notes: 'Lorry KN-123', items: [{ productId: flour.id, quantity: 70 }, { productId: flour.id, quantity: 50 }] });
check('transfer numbered TR-0001', tr.number === 'TR-0001', tr.number);
check('repeated item merged into one line', tr.lines.length === 1 && tr.lines[0].quantity === 120, JSON.stringify(tr.lines));
check('transfer value at cost 364,000', near(tr.totalCost, 100 * 3000 + 20 * 3200), tr.totalCost);
fLevels = await ok(A, 'GET', `/stock/levels/${flour.id}`);
check('factory 30, store 120', fLevels.find((l) => l.locationId === factory.id)?.quantity === 30 && fLevels.find((l) => l.locationId === store.id)?.quantity === 120, JSON.stringify(fLevels));
const storeBatches = await ok(A, 'GET', `/stock/batches/${flour.id}?locationId=${store.id}`);
check('store batches keep their costs', storeBatches.length === 2 && storeBatches[0].unitCost === 3000 && storeBatches[0].quantityRemaining === 100 && storeBatches[1].unitCost === 3200 && storeBatches[1].quantityRemaining === 20, JSON.stringify(storeBatches.map((b) => [b.unitCost, b.quantityRemaining])));
check('store batches keep supplier and delivery', storeBatches.every((b) => b.supplier?.name === 'Flour Co' && b.purchaseId), JSON.stringify(storeBatches.map((b) => [b.supplier?.name, b.purchaseId])));
const factoryBatches = await ok(A, 'GET', `/stock/batches/${flour.id}?locationId=${factory.id}`);
check('older batch at store keeps its date', new Date(storeBatches[0].receivedAt) < new Date(factoryBatches.find((b) => b.quantityRemaining > 0).receivedAt) || storeBatches[0].receivedAt <= factoryBatches[0].receivedAt);
const flourAfter = await ok(A, 'GET', `/products/${flour.id}?locationId=all`);
check('company stock and value unchanged', flourAfter.quantity === flourBefore.quantity && near(flourAfter.totalCostValue, flourBefore.totalCostValue), `${flourBefore.quantity}/${flourBefore.totalCostValue} -> ${flourAfter.quantity}/${flourAfter.totalCostValue}`);
const bsAfter = await ok(A, 'GET', '/accounting/balance-sheet');
check('balance sheet unchanged (no journal needed)', near(bsAfter.totalAssets ?? 0, bsBefore.totalAssets ?? 0), `${bsBefore.totalAssets} -> ${bsAfter.totalAssets}`);

// ---------- sell at the store: FIFO uses the transferred layers
const cust = await ok(A, 'POST', '/customers', { firstName: 'Store', lastName: 'Buyer' });
const inv = await ok(A, 'POST', `/invoices?locationId=${store.id}`, { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 110, unitPrice: 5000 }] });
await ok(A, 'POST', `/invoices/${inv.id}/finalize`, {});
const pl = await ok(A, 'GET', '/accounting/profit-loss');
check('store sale COGS = 100×3,000 + 10×3,200', near(pl.cogs, 332000), pl.cogs);

// ---------- supplier return from a batch that was transferred
const purchases = await ok(A, 'GET', '/purchases');
const grnB = purchases.find((p) => p.reference === 'GRN-B');
const storeLeft = (await ok(A, 'GET', `/stock/batches/${flour.id}?locationId=${store.id}`)).find((b) => b.quantityRemaining > 0);
r = await call(A, 'POST', `/purchases/${grnB.id}/return`, { batchId: storeLeft.id, quantity: 5, refundAccountId: bank.id });
check('can return transferred stock to its supplier', r.status === 200 || r.status === 201, `${r.status} ${r.message}`);

// ---------- reports per location
const smStore = await ok(A, 'GET', `/reports/stock-movement?locationId=${store.id}`);
const sf = smStore.find((x) => x.name === 'Flour 10kg');
check('store report: +120 transferred, -110 sold, -5 returned, 5 left', sf && sf.transferred === 120 && sf.sold === -110 && sf.returnedToSupplier === -5 && sf.closing === 5 && sf.opening === 0, JSON.stringify(sf));
const smFactory = await ok(A, 'GET', `/reports/stock-movement?locationId=${factory.id}`);
const ff = smFactory.find((x) => x.name === 'Flour 10kg');
check('factory report: +150 received, -120 transferred, 30 left', ff && ff.received === 150 && ff.transferred === -120 && ff.closing === 30, JSON.stringify(ff));
const smAll = await ok(A, 'GET', '/reports/stock-movement');
const af = smAll.find((x) => x.name === 'Flour 10kg');
check('company report: transfers net to zero', af && af.transferred === 0 && af.closing === 35, JSON.stringify(af));

// ---------- list, stock check, location delete
const list = await ok(A, 'GET', '/stock-transfers');
check('transfer listed', list.length === 1 && list[0].fromLocation.name && list[0].toLocation.name === 'Kano Store');
const sc = await ok(A, 'GET', '/stock/check');
check('stock check clean', sc.summary.issues === 0 && Math.abs(sc.summary.inventoryAccountDifference) < 0.01, JSON.stringify(sc.summary));
const tb = await ok(A, 'GET', '/accounting/trial-balance');
check('trial balance balanced', tb.balanced);
r = await call(A, 'DELETE', `/locations/${store.id}`);
check('location with transfers cannot be deleted', r.status === 400 || r.status === 409, r.status);

// ---------- roles and location access
const mkUser = async (role, locationIds) => {
  const email = `tr-${role}-${stamp}@example.test`;
  await ok(A, 'POST', '/users', { firstName: role, lastName: 'User', email, password: 'Password123!', role, locationIds });
  return (await call(null, 'POST', '/auth/login', { email, password: 'Password123!' })).data.token;
};
const K = await mkUser('storekeeper', [factory.id]);
r = await call(K, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: store.id, items: [{ productId: flour.id, quantity: 1 }] });
check('storekeeper without access to the store cannot send there', r.status === 403, `${r.status} ${r.message}`);
const kList = await ok(K, 'GET', '/stock-transfers');
check('storekeeper still sees transfers from their location', kList.length === 1);
await ok(A, 'PUT', `/users/${(await ok(A, 'GET', '/users')).find((u) => u.role === 'storekeeper').id}`, { locationIds: [factory.id, store.id] });
r = await call(K, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: store.id, items: [{ productId: flour.id, quantity: 1 }] });
check('with access to both, storekeeper can transfer', r.status === 201 && r.data.number === 'TR-0002', `${r.status} ${r.message}`);
const S = await mkUser('sales', [factory.id, store.id]);
r = await call(S, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: store.id, items: [{ productId: flour.id, quantity: 1 }] });
check('sales role cannot move stock', r.status === 403, r.status);
check('sales role can see transfers', (await call(S, 'GET', '/stock-transfers')).status === 200);

// ---------- isolation
const other = await call(null, 'POST', '/auth/register', { firstName: 'O', lastName: 'T', email: `tr-o-${stamp}@example.test`, password: 'Password123!', company: 'Other' });
const oLoc = (await ok(other.data.token, 'GET', '/locations'))[0];
r = await call(A, 'POST', '/stock-transfers', { fromLocationId: factory.id, toLocationId: oLoc.id, items: [{ productId: flour.id, quantity: 1 }] });
check("cannot send stock to another company's location", r.status === 404, r.status);
r = await call(other.data.token, 'GET', `/stock-transfers/${tr.id}`);
check("another company cannot read our transfer", r.status === 404, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
