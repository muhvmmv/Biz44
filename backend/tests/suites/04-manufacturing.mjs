// Manufacturing: a factory scenario with every figure computed by hand.
const BASE = process.env.TEST_API_URL || 'http://localhost:4100/api';
let pass = 0, fail = 0; const out = [];
const check = (n, c, d = '') => { c ? pass++ : fail++; out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${!c ? `  -> ${d}` : ''}`); };
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
const reg = await (await fetch(BASE + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ firstName: 'Mf', lastName: 'Owner', email: `mf-${Date.now()}@example.test`, password: 'Password123!', company: 'Factory Test' }) })).json();
const T = reg.data.token;
async function C(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); return { status: r.status, data: j.data, json: j };
}
const ledgerOk = async (label) => {
  const lc = (await C('GET', '/accounting/ledger-check')).data;
  check(`Ledger balanced after ${label}`, lc.balanced && lc.balanceMismatches.length === 0, JSON.stringify(lc));
};
const acct = async (key) => (await C('GET', '/accounting/accounts')).data.find((a) => a.systemKey === key).balance;
const bank = (await C('GET', '/accounting/payment-accounts')).data.find((a) => a.subtype === 'bank');

// ---------- items ----------
const maize = (await C('POST', '/products', { name: 'Maize', itemType: 'raw_material', unit: 'kg', cost: 300, reorderPoint: 200 })).data;
const bags = (await C('POST', '/products', { name: 'Flour bag', itemType: 'packaging', unit: 'pcs', cost: 20 })).data;
const flour = (await C('POST', '/products', { name: 'Maize Flour 1kg', itemType: 'finished_good', unit: 'pcs', price: 1500 })).data;
check('Products created with type and unit', maize.itemType === 'raw_material' && maize.unit === 'kg' && bags.itemType === 'packaging');
check('Unknown unit rejected', (await C('POST', '/products', { name: 'X', unit: 'furlong' })).status === 400);
const supp = (await C('POST', '/suppliers', { name: 'Grain Farms' })).data;
const cust = (await C('POST', '/customers', { firstName: 'Ayesha', lastName: 'Stores' })).data;

// ---------- receiving raw materials ----------
const po1 = (await C('POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 1000, unitCost: 300 }], supplierId: supp.id, paymentStatus: 'unpaid', reference: 'PO-M1' })).data;
await C('POST', '/stock/receive', { items: [{ productId: maize.id, quantity: 500, unitCost: 320 }, { productId: bags.id, quantity: 1000, unitCost: 20 }], supplierId: supp.id, paymentStatus: 'paid', paymentAccountId: bank.id, reference: 'PO-M2' });
check('Raw materials account = 480,000', await acct('inventory_raw') === 480000, String(await acct('inventory_raw')));
check('Finished goods account untouched', await acct('inventory') === 0);
await ledgerOk('receiving raw materials');

// ---------- bill of materials ----------
check('BOM for a raw material refused', (await C('POST', '/production/boms', { productId: maize.id, outputQuantity: 1, lines: [{ componentId: bags.id, quantity: 1 }] })).status === 400);
check('BOM using the product itself refused', (await C('POST', '/production/boms', { productId: flour.id, outputQuantity: 1, lines: [{ componentId: flour.id, quantity: 1 }] })).status === 400);
check('Plan without a BOM refused', (await C('GET', `/production/plan?productId=${flour.id}&quantity=10`)).status === 400);
const bom = await C('POST', '/production/boms', { productId: flour.id, outputQuantity: 100, lines: [
  { componentId: maize.id, quantity: 100, scrapPercent: 2 }, { componentId: bags.id, quantity: 100 }] });
check('BOM saved', bom.status === 201, JSON.stringify(bom.json));
// Estimated unit cost: 1.02 kg maize x average (1000x300 + 500x320)/1500 = 306.67 + 1 bag x 20
check('BOM estimated cost per unit = 1.02 x 306.67 + 20 = 332.80', near(bom.data.estimatedUnitCost, 332.8), String(bom.data.estimatedUnitCost));
check('Second BOM for the same product refused', (await C('POST', '/production/boms', { productId: flour.id, outputQuantity: 1, lines: [{ componentId: bags.id, quantity: 1 }] })).status === 400);

const plan = (await C('GET', `/production/plan?productId=${flour.id}&quantity=500`)).data;
const pm = Object.fromEntries(plan.materials.map((m) => [m.name, m]));
check('Plan for 500: 510 kg maize, 500 bags', pm['Maize'].required === 510 && pm['Flour bag'].required === 500, JSON.stringify(plan.materials));
check('Plan can start (enough stock)', plan.canStart === true);

// ---------- order 1: full run ----------
const o1 = (await C('POST', '/production/orders', { productId: flour.id, plannedQuantity: 500 })).data;
check('Order numbered MO-0001 as a draft', o1.number === 'MO-0001' && o1.status === 'draft', JSON.stringify(o1));
let d1 = (await C('GET', `/production/orders/${o1.id}`)).data;
const mMaize = d1.materials.find((m) => m.product.name === 'Maize');
const mBags = d1.materials.find((m) => m.product.name === 'Flour bag');
check('Draft does not move stock', (await acct('inventory_wip')) === 0 && (await acct('inventory_raw')) === 480000);
const both = await Promise.all([
  C('POST', `/production/orders/${o1.id}/start`, { quantities: { [mMaize.id]: 520, [mBags.id]: 500 } }),
  C('POST', `/production/orders/${o1.id}/start`, { quantities: { [mMaize.id]: 520, [mBags.id]: 500 } }),
]);
check('Double-click start runs once', both.filter((r) => r.status === 200).length === 1, both.map((r) => r.status).join(','));
check('WIP = 520 x 300 + 500 x 20 = 166,000', await acct('inventory_wip') === 166000, String(await acct('inventory_wip')));
await ledgerOk('starting production');
const ret = await C('POST', `/production/orders/${o1.id}/return`, { materialId: mMaize.id, quantity: 10 });
check('Return 10 kg unused maize', ret.status === 200, JSON.stringify(ret.json));
check("Can't return more than issued", (await C('POST', `/production/orders/${o1.id}/return`, { materialId: mMaize.id, quantity: 9999 })).status === 400);
await C('POST', `/production/orders/${o1.id}/issue`, { productId: bags.id, quantity: 5 });
check('WIP = 166,000 - 3,000 + 100 = 163,100', await acct('inventory_wip') === 163100, String(await acct('inventory_wip')));
d1 = (await C('GET', `/production/orders/${o1.id}`)).data;
const tm = d1.materials.find((m) => m.product.name === 'Maize');
check('Maize traced to delivery PO-M1 (510 kg)', tm.batches.length === 1 && tm.batches[0].quantity === 510 && tm.batches[0].batch.purchase.reference === 'PO-M1' && tm.batches[0].batch.supplier.name === 'Grain Farms', JSON.stringify(tm.batches));
const comp = await C('POST', `/production/orders/${o1.id}/complete`, { producedQuantity: 495 });
check('Complete with 495 produced', comp.status === 200 && comp.data.status === 'completed', JSON.stringify(comp.json));
const unit = 163100 / 495;
check('Unit cost = 163,100 / 495 = 329.49', near(comp.data.unitCost, unit, 0.0001), String(comp.data.unitCost));
check('WIP back to 0, finished goods = 163,100', await acct('inventory_wip') === 0 && await acct('inventory') === 163100);
check('Yield 99% and shortfall 5', comp.data.yieldPercent === 99 && comp.data.outputShortfall === 5, JSON.stringify([comp.data.yieldPercent, comp.data.outputShortfall]));
const over = Object.fromEntries(comp.data.materials.map((m) => [m.product.name, m.overUsage]));
check('Over-usage vs standard: maize 5.1 kg, bags 10', over['Maize'] === 5.1 && over['Flour bag'] === 10, JSON.stringify(over));
const fg = (await C('GET', `/stock/batches/${flour.id}`)).data;
check('Finished goods batch traced to MO-0001 at actual cost', fg.length === 1 && fg[0].productionOrderId === o1.id && near(fg[0].unitCost, unit, 0.0001) && fg[0].quantityRemaining === 495, JSON.stringify(fg));
check('Raw materials = 316,900 (batches: 490 kg@300 + 500 kg@320 + 495 bags@20)', await acct('inventory_raw') === 316900, String(await acct('inventory_raw')));
check("Completed order can't be cancelled", (await C('POST', `/production/orders/${o1.id}/cancel`)).status === 400);
await ledgerOk('completing production');

// ---------- sell with discount and payment at invoicing ----------
const inv = (await C('POST', '/invoices', { customerId: cust.id, discountType: 'percent', discountValue: 10,
  items: [{ productId: flour.id, description: 'Maize Flour 1kg', quantity: 200, unitPrice: 1500 }] })).data;
check('Invoice: subtotal 300,000, discount 30,000, total 270,000', inv.subtotal === 300000 && inv.discountTotal === 30000 && inv.total === 270000, JSON.stringify([inv.subtotal, inv.discountTotal, inv.total]));
check('Discount over 100% refused', (await C('POST', '/invoices', { customerId: cust.id, discountType: 'percent', discountValue: 120, items: [{ description: 'x', quantity: 1, unitPrice: 1 }] })).status === 400);
const fin = await C('POST', `/invoices/${inv.id}/finalize`, { payment: { amount: 100000, accountId: bank.id, method: 'bank_transfer' } });
check('Finalize with 100,000 paid at once', fin.status === 200, JSON.stringify(fin.json));
const invd = (await C('GET', `/invoices/${inv.id}`)).data;
check('Invoice partly paid: 100,000 of 270,000', invd.status === 'partially_paid' && invd.amountPaid === 100000);
const pl = (await C('GET', '/accounting/profit-loss')).data;
check('Revenue 270,000 (net of discount)', pl.revenue === 270000, String(pl.revenue));
check('COGS = 200 x production cost = 65,898.99', near(pl.cogs, 65898.99), String(pl.cogs));
check('Receivables 170,000', await acct('ar') === 170000, String(await acct('ar')));
check('Finished goods left = 163,100 - 65,898.99 = 97,201.01', near(await acct('inventory'), 97201.01), String(await acct('inventory')));
await ledgerOk('the sale');

// ---------- raw materials are not sold; decimal quantities via a write-off ----------
const rawSale = await C('POST', '/invoices', { customerId: cust.id, items: [{ productId: maize.id, description: 'Maize', quantity: 2.5, unitPrice: 500 }] });
check('Invoicing a raw material is refused', rawSale.status === 400 && /finished goods/i.test(rawSale.json.message), JSON.stringify(rawSale.json));
await C('POST', '/stock/damage', { productId: maize.id, quantity: 2.5, reason: 'Spilled' });
check('Writing off 2.5 kg maize takes cost 750 from raw materials', await acct('inventory_raw') === 316150, String(await acct('inventory_raw')));

// ---------- order 2: cancel a running order ----------
const o2 = (await C('POST', '/production/orders', { productId: flour.id, plannedQuantity: 100 })).data;
await C('POST', `/production/orders/${o2.id}/start`);
check('Order 2 running: WIP = 102 kg x 300 + 100 x 20 = 32,600', await acct('inventory_wip') === 32600, String(await acct('inventory_wip')));
await C('POST', `/production/orders/${o2.id}/cancel`);
check('Cancel returns everything: WIP 0, raw back to 316,150', await acct('inventory_wip') === 0 && await acct('inventory_raw') === 316150, String([await acct('inventory_wip'), await acct('inventory_raw')]));
const maizeBatches = (await C('GET', `/stock/batches/${maize.id}`)).data;
check('Maize back in its original batches (487.5 kg @300, 500 kg @320)', maizeBatches[0].quantityRemaining === 487.5 && maizeBatches[1].quantityRemaining === 500, JSON.stringify(maizeBatches.map((b) => [b.quantityRemaining, b.unitCost])));

// ---------- order 3: not enough stock ----------
const big = (await C('GET', `/production/plan?productId=${flour.id}&quantity=2000`)).data;
check('Plan for 2,000 shows a maize shortage', big.canStart === false && big.materials.find((m) => m.name === 'Maize').shortage === roundQty(2040 - 987.5), JSON.stringify(big.materials));
const o3 = (await C('POST', '/production/orders', { productId: flour.id, plannedQuantity: 2000 })).data;
const s3 = await C('POST', `/production/orders/${o3.id}/start`);
check('Starting without enough stock refused, nothing moved', s3.status === 400 && /Insufficient/.test(s3.json.message) && await acct('inventory_wip') === 0, JSON.stringify(s3.json));
check('Order 3 still a draft', (await C('GET', `/production/orders/${o3.id}`)).data.status === 'draft');
await C('POST', `/production/orders/${o3.id}/cancel`);

// ---------- order 4: failed run (nothing produced) ----------
const lossBefore = await acct('inventory_loss');
const o4 = (await C('POST', '/production/orders', { productId: flour.id, plannedQuantity: 10 })).data;
await C('POST', `/production/orders/${o4.id}/start`);
const c4 = await C('POST', `/production/orders/${o4.id}/complete`, { producedQuantity: 0 });
check('Failed run: 10.2 kg x 300 + 10 x 20 = 3,260 written off', c4.status === 200 && near((await acct('inventory_loss')) - lossBefore, 3260), String((await acct('inventory_loss')) - lossBefore));
check('Raw materials 316,150 - 3,260 = 312,890', await acct('inventory_raw') === 312890, String(await acct('inventory_raw')));
await ledgerOk('cancel, refusal and write-off');

// ---------- reclassify a product ----------
const salt = (await C('POST', '/products', { name: 'Salt', itemType: 'finished_good', unit: 'kg', cost: 50, quantity: 10 })).data;
const fgBefore = await acct('inventory');
await C('PUT', `/products/${salt.id}`, { itemType: 'raw_material' });
check('Changing Salt to raw material moves its 500 value', near(fgBefore - await acct('inventory'), 500) && await acct('inventory_raw') === 313390, String([fgBefore - await acct('inventory'), await acct('inventory_raw')]));
await ledgerOk('reclassification');

// ---------- checks and analytics ----------
const sc = (await C('GET', '/stock/check')).data;
check('Stock check: no issues, inventory accounts = batches, WIP = running orders', sc.summary.issues === 0 && Math.abs(sc.summary.inventoryAccountDifference) < 0.02 && sc.summary.wipDifference === 0, JSON.stringify(sc.summary));
const sum = (await C('GET', '/production/summary')).data;
const fp = sum.products.find((p) => p.name === 'Maize Flour 1kg');
check('Summary: 2 completed orders, 495 produced of 510 planned', sum.completedOrders === 2 && fp.produced === 495 && fp.planned === 510 && fp.shortfall === 15, JSON.stringify(fp));
check('Summary: production cost 163,100 + 3,260 = 166,360', near(sum.totalCost, 166360), String(sum.totalCost));
const sm = Object.fromEntries(sum.materials.map((m) => [m.name, m.overUsage]));
check('Summary: over-usage maize 15.3 kg, bags 20', sm['Maize'] === 15.3 && sm['Flour bag'] === 20, JSON.stringify(sm));
const dash = (await C('GET', '/dashboard/summary?months=1')).data;
check('Dashboard stages: raw 313,390, WIP 0, finished 97,201.01', near(dash.inventoryByStage.raw, 313390) && dash.inventoryByStage.wip === 0 && near(dash.inventoryByStage.finished, 97201.01), JSON.stringify(dash.inventoryByStage));
check('Dashboard production: 2 completed, 0 running', dash.production.completedOrders === 2 && dash.production.inProgressOrders === 0);
const bs = (await C('GET', '/accounting/balance-sheet')).data;
check('Balance sheet balances', bs.balanced, `${bs.totalAssets} vs ${bs.totalLiabilitiesAndEquity}`);

function roundQty(n) { return Math.round((n + Number.EPSILON) * 1e4) / 1e4; }
console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
