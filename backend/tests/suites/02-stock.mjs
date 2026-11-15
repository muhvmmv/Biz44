// Phase 1 tests: FIFO, multi-location stock, cancellations, supplier returns,
// stock counts, stock check, concurrency. Run through tests/run.mjs.
import { sql } from '../db.mjs';
const BASE = process.env.TEST_API_URL || 'http://localhost:4100/api';
const PSQL = sql;
let pass = 0, fail = 0; const out = [];
const check = (name, cond, detail = '') => { cond ? pass++ : fail++; out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond ? `  -> ${detail}` : ''}`); };

async function call(token, method, path, body, loc) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(loc ? { 'x-location-id': loc } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, json: j, data: j.data };
}
const reg = await (await fetch(BASE + '/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ firstName: 'P1', lastName: 'Test', email: `p1-${Date.now()}@example.test`, password: 'Password123!', company: 'Phase1 Mills' }),
})).json();
const T = reg.data.token;
const companyId = reg.data.user.companyId;
const factory = (await call(T, 'GET', '/locations')).data[0].id;
const acct = async (name) => (await call(T, 'GET', '/accounting/accounts')).data.find((a) => a.name === name).balance;
const bank = (await call(T, 'GET', '/accounting/payment-accounts')).data.find((a) => a.name === 'Bank Account');

const supp = (await call(T, 'POST', '/suppliers', { name: 'Grain Co' })).data;
const cust = (await call(T, 'POST', '/customers', { firstName: 'Bola', lastName: 'Retail' })).data;
const flour = (await call(T, 'POST', '/products', { name: 'Flour', price: 200, cost: 100 })).data;

// ---------- FIFO ----------
const po1 = (await call(T, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 10, unitCost: 100 }], supplierId: supp.id, paymentStatus: 'unpaid', reference: 'PO-A' })).data;
await call(T, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 10, unitCost: 120 }], supplierId: supp.id, paymentStatus: 'paid', paymentAccountId: bank.id, reference: 'PO-B' });
const inv1 = (await call(T, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 15, unitPrice: 200 }] })).data;
await call(T, 'POST', `/invoices/${inv1.id}/finalize`);
const cogs1 = await PSQL(`select sum("totalCost") from stock_movements where reference='${inv1.invoiceNumber}' and type='sale' and "companyId"='${companyId}'`);
check('FIFO COGS = 10×100 + 5×120 = 1600', Number(cogs1) === 1600, cogs1);
let p = (await call(T, 'GET', `/products/${flour.id}`)).data;
check('Remaining 5 units valued at 5×120 = 600', p.quantity === 5 && p.totalCostValue === 600, JSON.stringify([p.quantity, p.totalCostValue]));
check('PO paid on receipt has a payment record', (await call(T, 'GET', `/purchases`)).data.find((x) => x.reference === 'PO-B').payments.length === 1);

// ---------- two locations ----------
const lagos = (await call(T, 'POST', '/locations', { name: 'Lagos Store', city: 'Lagos' })).data.id;
const noLoc = await call(T, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 1, unitCost: 1 }], paymentStatus: 'unpaid' });
check('With 2 locations, receiving without choosing one is rejected', noLoc.status === 400, JSON.stringify(noLoc.json));
await call(T, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 8, unitCost: 130 }], supplierId: supp.id, paymentStatus: 'unpaid', reference: 'PO-L' }, lagos);
check('Factory shows its own stock (5)', (await call(T, 'GET', `/products/${flour.id}`, null, factory)).data.quantity === 5);
check('Lagos shows its own stock (8)', (await call(T, 'GET', `/products/${flour.id}`, null, lagos)).data.quantity === 8);
check('All locations shows 13', (await call(T, 'GET', `/products/${flour.id}`, null, 'all')).data.quantity === 13);
const invF = (await call(T, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 6, unitPrice: 200 }] }, factory)).data;
const finF = await call(T, 'POST', `/invoices/${invF.id}/finalize`);
check('Factory cannot sell Lagos stock (6 > 5)', finF.status === 400 && /Insufficient/.test(finF.json.message), JSON.stringify(finF.json));
check('Failed sale left invoice as draft', (await call(T, 'GET', `/invoices/${invF.id}`)).data.status === 'draft');
const dash = (await call(T, 'GET', '/dashboard/summary', null, lagos)).data;
check('Dashboard inventory value for Lagos = 8×130', dash.inventoryValue === 1040, String(dash.inventoryValue));

// ---------- cancel a paid invoice ----------
const arBefore = await acct('Accounts Receivable');
const bankBefore = await acct('Bank Account');
const plBefore = (await call(T, 'GET', '/accounting/profit-loss', null, 'all')).data;
const inv2 = (await call(T, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: flour.id, description: 'Flour', quantity: 3, unitPrice: 200 }] }, lagos)).data;
await call(T, 'POST', `/invoices/${inv2.id}/finalize`);
await call(T, 'POST', `/invoices/${inv2.id}/payment`, { amount: 250, accountId: bank.id });
const noRefund = await call(T, 'POST', `/invoices/${inv2.id}/cancel`, {});
check('Cancelling a paid invoice requires a refund account', noRefund.status === 400, JSON.stringify(noRefund.json));
const cancel = await call(T, 'POST', `/invoices/${inv2.id}/cancel`, { refundAccountId: bank.id });
check('Cancel with refund succeeds', cancel.status === 200, JSON.stringify(cancel.json));
check('Receivables back to where they were', Math.abs((await acct('Accounts Receivable')) - arBefore) < 0.01, `${arBefore} -> ${await acct('Accounts Receivable')}`);
check('Bank back to where it was (paid 250, refunded 250)', Math.abs((await acct('Bank Account')) - bankBefore) < 0.01);
check('Lagos stock restored to 8', (await call(T, 'GET', `/products/${flour.id}`, null, lagos)).data.quantity === 8);
const lagosBatch = (await call(T, 'GET', `/stock/batches/${flour.id}`, null, lagos)).data;
check('Stock went back into the original 130 batch', lagosBatch.length === 1 && lagosBatch[0].quantityRemaining === 8 && lagosBatch[0].unitCost === 130, JSON.stringify(lagosBatch.map((b) => [b.quantityRemaining, b.unitCost])));
const plAfter = (await call(T, 'GET', '/accounting/profit-loss', null, 'all')).data;
check('P&L revenue and COGS net out the cancellation', plAfter.revenue === plBefore.revenue && plAfter.cogs === plBefore.cogs, JSON.stringify([plBefore.revenue, plAfter.revenue, plBefore.cogs, plAfter.cogs]));
check('Cancelled invoice amountPaid = 0', (await call(T, 'GET', `/invoices/${inv2.id}`)).data.amountPaid === 0);

// ---------- supplier returns ----------
const po1d = (await call(T, 'GET', `/purchases/${po1.id}`)).data;
const po1Batch = po1d.batches[0];
check('PO-A batch is fully sold (0 left)', po1Batch.quantityRemaining === 0);
const tooMany = await call(T, 'POST', `/purchases/${po1.id}/return`, { batchId: po1Batch.id, quantity: 1 });
check("Can't return units already sold", tooMany.status === 400);
const poR = (await call(T, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 10, unitCost: 100 }], supplierId: supp.id, paymentStatus: 'unpaid', reference: 'PO-R' }, factory)).data;
const poRb = (await call(T, 'GET', `/purchases/${poR.id}`)).data.batches[0];
const apBefore = await acct('Accounts Payable');
const r1 = await call(T, 'POST', `/purchases/${poR.id}/return`, { batchId: poRb.id, quantity: 2 });
let poRd = (await call(T, 'GET', `/purchases/${poR.id}`)).data;
check('Return on unpaid purchase reduces amount owed to 800', r1.status === 200 && poRd.total - poRd.amountPaid - poRd.returnedAmount === 800 && poRd.total === 1000, JSON.stringify([r1.json, poRd.total, poRd.returnedAmount]));
check('Accounts Payable down by 200', Math.abs(apBefore - (await acct('Accounts Payable')) - 200) < 0.01);
await call(T, 'POST', `/purchases/${poR.id}/pay`, { amount: 800, accountId: bank.id });
poRd = (await call(T, 'GET', `/purchases/${poR.id}`)).data;
check('Paying the remaining 800 marks it paid', poRd.status === 'paid', poRd.status);
const r2 = await call(T, 'POST', `/purchases/${poR.id}/return`, { batchId: poRb.id, quantity: 1 });
check('Return on a paid purchase needs a refund account', r2.status === 400, JSON.stringify(r2.json));
const bankB = await acct('Bank Account');
const r3 = await call(T, 'POST', `/purchases/${poR.id}/return`, { batchId: poRb.id, quantity: 1, refundAccountId: bank.id });
poRd = (await call(T, 'GET', `/purchases/${poR.id}`)).data;
check('Refund of 100 received into bank', r3.status === 200 && Math.abs((await acct('Bank Account')) - bankB - 100) < 0.01);
const paySum = poRd.payments.reduce((s, x) => s + x.amount, 0);
check('Purchase amountPaid equals sum of its payments', Math.abs(paySum - poRd.amountPaid) < 0.01, `${paySum} vs ${poRd.amountPaid}`);
check('Paid purchase still owes 0 after refund', Math.abs(poRd.total - poRd.amountPaid - poRd.returnedAmount) < 0.01);
const otherBatch = await call(T, 'POST', `/purchases/${poR.id}/return`, { batchId: lagosBatch[0].id, quantity: 1, refundAccountId: bank.id });
check("Can't return a batch from a different purchase", otherBatch.status === 400);

// ---------- counts and adjustments ----------
const onHand = (await call(T, 'GET', `/products/${flour.id}`, null, factory)).data.quantity;
const cAll = await call(T, 'POST', '/stock/count', { productId: flour.id, countedQuantity: 1 }, 'all');
check('Count requires a specific location', cAll.status === 400);
const lossBefore = await acct('Inventory Loss');
const c1 = await call(T, 'POST', '/stock/count', { productId: flour.id, countedQuantity: onHand - 2 }, factory);
check('Count lower by 2 removes 2 and books a loss', c1.status === 201 && c1.data.delta === -2 && (await acct('Inventory Loss')) > lossBefore, JSON.stringify(c1.json));
const c2 = await call(T, 'POST', '/stock/count', { productId: flour.id, countedQuantity: onHand - 2 }, factory);
check('Counting the same number again changes nothing', c2.status === 200 && c2.data.delta === 0);
const adj = await call(T, 'POST', '/stock/adjust', { productId: flour.id, quantity: 3, notes: 'found' }, factory);
check('Positive adjustment adds stock', adj.status === 201 && adj.data.onHand === onHand + 1, JSON.stringify(adj.json));
const dmg = await call(T, 'POST', '/stock/damage', { productId: flour.id, quantity: 999 }, factory);
check('Write-off larger than location stock rejected', dmg.status === 400);

// ---------- stock check ----------
let chk = (await call(T, 'GET', '/stock/check')).data;
check('Clean data: stock check finds 0 issues', chk.summary.issues === 0, JSON.stringify(chk.issues));
const salt = (await call(T, 'POST', '/products', { name: 'Salt', price: 50, cost: 20 })).data;
const sugar = (await call(T, 'POST', '/products', { name: 'Sugar', price: 80, cost: 40 }, factory)).data;
await call(T, 'POST', '/stock/receive', { items: [{ productId: sugar.id, quantity: 10, unitCost: 40 }], paymentStatus: 'unpaid' }, factory);
// Inject the three kinds of damage older bugs could leave behind:
await PSQL(`update products set quantity = 30 where id = '${salt.id}'`);                       // stock with no batches
await PSQL(`update inventory_batches set "locationId" = null where "productId" = '${sugar.id}'`); // batch with no location
await PSQL(`update products set quantity = quantity + 4 where id = '${flour.id}'`);            // drift
chk = (await call(T, 'GET', '/stock/check')).data;
const types = chk.issues.map((i) => i.type).sort().join(',');
check('Stock check detects all three problems', types === 'batch_without_location,quantity_mismatch,stock_without_batches', types);
check('Products list flags Flour for a stock check', (await call(T, 'GET', '/products', null, 'all')).data.find((x) => x.id === flour.id).needsStockCheck === true);
check('Running the check changed nothing', await PSQL(`select quantity from products where id='${salt.id}'`) === '30');
const fix = (await call(T, 'POST', '/stock/check/fix')).data;
check('Safe fix: 1 batch assigned, 1 opening batch created', fix.batchesAssigned === 1 && fix.openingBatchesCreated === 1 && fix.leftForCount === 1, JSON.stringify(fix));
chk = (await call(T, 'GET', '/stock/check')).data;
check('Only the quantity mismatch is left for a count', chk.issues.length === 1 && chk.issues[0].type === 'quantity_mismatch', JSON.stringify(chk.issues));
check('Salt is now sellable at the factory (30)', (await call(T, 'GET', `/products/${salt.id}`, null, factory)).data.quantity === 30);
const counted = await call(T, 'POST', '/stock/count', { productId: flour.id, countedQuantity: 4 }, factory);
check('Recording a count resolves the mismatch', counted.status === 201 && (await call(T, 'GET', '/stock/check')).data.summary.issues === 0, JSON.stringify(counted.json));

// ---------- concurrency ----------
const rice = (await call(T, 'POST', '/products', { name: 'Rice', price: 10, cost: 5, quantity: 5 }, factory)).data;
const mk = async () => (await call(T, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: rice.id, description: 'Rice', quantity: 3, unitPrice: 10 }] }, factory)).data;
const [a, b] = [await mk(), await mk()];
const results = await Promise.all([call(T, 'POST', `/invoices/${a.id}/finalize`), call(T, 'POST', `/invoices/${b.id}/finalize`)]);
const ok = results.filter((r) => r.status === 200).length;
const riceLeft = (await call(T, 'GET', `/products/${rice.id}`, null, factory)).data.quantity;
check('Two simultaneous sales of 3 from 5: exactly one succeeds', ok === 1 && riceLeft === 2, JSON.stringify([results.map((r) => r.status), riceLeft]));
const c = (await call(T, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: rice.id, description: 'Rice', quantity: 1, unitPrice: 10 }] }, factory)).data;
const dbl = await Promise.all([call(T, 'POST', `/invoices/${c.id}/finalize`), call(T, 'POST', `/invoices/${c.id}/finalize`)]);
const saleRows = await PSQL(`select count(*) from journal_entries where "sourceType"='invoice' and "sourceId"='${c.id}'`);
check('Double-click finalize posts revenue only once', saleRows === '1' && dbl.filter((r) => r.status === 200).length === 1, `${dbl.map((r) => r.status)} rows=${saleRows}`);
check('No negative batches anywhere', await PSQL(`select count(*) from inventory_batches where "quantityRemaining" < 0`) === '0');

// ---------- invoice numbering ----------
check("A new company's first invoice is INV-0001", inv1.invoiceNumber === 'INV-0001', inv1.invoiceNumber);
const many = await Promise.all([1, 2, 3, 4, 5].map(() =>
  call(T, 'POST', '/invoices', { customerId: cust.id, items: [{ description: 'Service', quantity: 1, unitPrice: 5 }] }, factory)));
const nums = many.map((r) => r.data?.invoiceNumber);
check('5 invoices created at once get 5 different numbers', many.every((r) => r.status === 201) && new Set(nums).size === 5, JSON.stringify(nums));
check('Numbers stay in the short INV-n format', nums.every((n) => /^INV-\d{4}$/.test(n)), JSON.stringify(nums));

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
