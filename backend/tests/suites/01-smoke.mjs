// Phase 0 smoke test against a running Biz44 API (throwaway database).
const BASE = process.env.TEST_API_URL || 'http://localhost:4100/api';
let pass = 0, fail = 0;
const results = [];

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { nonJson: text.slice(0, 80) }; }
  return { status: res.status, json };
}
function check(name, cond, detail = '') {
  if (cond) pass++; else fail++;
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? `  -> ${detail}` : ''}`);
}
const stamp = Date.now();
async function register(tag) {
  const r = await call(null, 'POST', '/auth/register', {
    firstName: tag, lastName: 'Owner', email: `${tag}-${stamp}@example.test`, password: 'Password123!', company: `${tag} Foods`,
  });
  return r.json.data.token;
}

const A = await register('alpha');
const B = await register('beta');

// ---------- setup for company A ----------
const cust = (await call(A, 'POST', '/customers', { firstName: 'Ada', lastName: 'Buyer', companyId: 'evil' })).json.data;
const supp = (await call(A, 'POST', '/suppliers', { name: 'Maize Farms' })).json.data;
const prodRes = await call(A, 'POST', '/products', { name: 'Maize Flour 1kg', price: 150, cost: 100, quantity: 10, reorderPoint: 2 });
const prod = prodRes.json.data;
check('Create product with opening stock', prodRes.status === 201 && prod.quantity === 10, JSON.stringify(prodRes.json));
check('Create ignores injected companyId', cust.companyId !== 'evil');

const batches = await call(A, 'GET', `/stock/batches/${prod.id}`);
check('Opening stock creates a FIFO batch', batches.json.data?.length === 1 && batches.json.data[0].quantityRemaining === 10, JSON.stringify(batches.json));

// ---------- cross-company access (B attacks A) ----------
for (const [label, path] of [['customer', `/customers/${cust.id}`], ['supplier', `/suppliers/${supp.id}`], ['product', `/products/${prod.id}`]]) {
  check(`B cannot read A's ${label}`, (await call(B, 'GET', path)).status === 404);
  check(`B cannot edit A's ${label}`, (await call(B, 'PUT', path, { name: 'pwned', firstName: 'pwned' })).status === 404);
  check(`B cannot delete A's ${label}`, (await call(B, 'DELETE', path)).status === 404);
}
const bRecv = await call(B, 'POST', '/stock/receive', { items: [{ productId: prod.id, quantity: 5, unitCost: 1 }], paymentStatus: 'unpaid' });
check("B cannot receive stock into A's product", bRecv.status === 404, `${bRecv.status} ${JSON.stringify(bRecv.json)}`);
const bAdj = await call(B, 'POST', '/stock/adjust', { productId: prod.id, quantity: -5 });
check("B cannot adjust A's product", bAdj.status === 404, `${bAdj.status}`);
const bInv = await call(B, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: prod.id, description: 'x', quantity: 1, unitPrice: 1 }] });
check("B cannot invoice A's customer/product", bInv.status === 404, `${bInv.status} ${JSON.stringify(bInv.json)}`);
check("A's product unchanged after attacks", (await call(A, 'GET', `/products/${prod.id}`)).json.data.quantity === 10);

// ---------- field whitelist ----------
const upd = await call(A, 'PUT', `/products/${prod.id}`, { quantity: 999, price: 160, companyId: 'x' });
check('Product edit ignores quantity, keeps price change', upd.json.data?.quantity === 10 && upd.json.data?.price === 160, JSON.stringify(upd.json));

// ---------- invoice + payment validation ----------
const inv = (await call(A, 'POST', '/invoices', { customerId: cust.id, items: [{ productId: prod.id, description: 'Maize Flour 1kg', quantity: 3, unitPrice: 160 }] })).json.data;
check('Payment on a draft is rejected', (await call(A, 'POST', `/invoices/${inv.id}/payment`, { amount: 10 })).status === 400);
const fin = await call(A, 'POST', `/invoices/${inv.id}/finalize`);
check('Finalize invoice', fin.status === 200, JSON.stringify(fin.json));
check('B cannot read A invoice', (await call(B, 'GET', `/invoices/${inv.id}`)).status === 404);
check('B cannot pay A invoice', (await call(B, 'POST', `/invoices/${inv.id}/payment`, { amount: 1 })).status === 404);
check('Negative payment rejected', (await call(A, 'POST', `/invoices/${inv.id}/payment`, { amount: -50 })).status === 400);
check('Overpayment rejected', (await call(A, 'POST', `/invoices/${inv.id}/payment`, { amount: 10000 })).status === 400);

const accounts = (await call(A, 'GET', '/accounting/payment-accounts')).json.data;
const names = accounts.map((a) => a.name);
check('Payment accounts = cash/bank only', names.includes('Cash') && names.includes('Bank Account') && !names.includes('Inventory') && !names.includes('Accounts Receivable'), names.join(','));
const bank = accounts.find((a) => a.name === 'Bank Account');
const pay = await call(A, 'POST', `/invoices/${inv.id}/payment`, { amount: 200, accountId: bank.id, method: 'bank_transfer' });
check('Valid payment into Bank Account', pay.status === 200, JSON.stringify(pay.json));
const bankAfter = (await call(A, 'GET', '/accounting/payment-accounts')).json.data.find((a) => a.name === 'Bank Account');
check('Bank balance increased by 200', bankAfter.balance === 200, String(bankAfter.balance));
const bAcct = (await call(B, 'GET', '/accounting/payment-accounts')).json.data[0];
check("A cannot pay into B's account", (await call(A, 'POST', `/invoices/${inv.id}/payment`, { amount: 1, accountId: bAcct.id })).status === 400);

// ---------- account injection ----------
const badRecv = await call(A, 'POST', '/stock/receive', {
  items: [{ productId: prod.id, quantity: 5, unitCost: 100 }], supplierId: supp.id, paymentStatus: 'paid', paymentAccount: 'Hacker Slush Fund',
});
check('Receive with made-up account rejected', badRecv.status === 400, `${badRecv.status} ${JSON.stringify(badRecv.json)}`);
const arRecv = await call(A, 'POST', '/stock/receive', {
  items: [{ productId: prod.id, quantity: 5, unitCost: 100 }], paymentStatus: 'paid', paymentAccount: 'Accounts Receivable',
});
check('Receive paid from Accounts Receivable rejected', arRecv.status === 400);
const allAccts = (await call(A, 'GET', '/accounting/accounts')).json.data.map((a) => a.name);
check('No account created from user input', !allAccts.includes('Hacker Slush Fund'));
check('Expense category "Cash" rejected', (await call(A, 'POST', '/accounting/expenses', { category: 'Cash', amount: 10 })).status === 400);
const exp = await call(A, 'POST', '/accounting/expenses', { category: 'Utilities Expense', amount: 50, accountId: bank.id });
check('Expense paid from bank', exp.status === 201, JSON.stringify(exp.json));

// ---------- purchases ----------
const recv = await call(A, 'POST', '/stock/receive', {
  items: [{ productId: prod.id, quantity: 20, unitCost: 110 }], supplierId: supp.id, paymentStatus: 'unpaid', reference: 'PO-1',
});
check('Receive on credit', recv.status === 201, JSON.stringify(recv.json));
const purchaseId = recv.json.data?.id;
check('B cannot read A purchase', (await call(B, 'GET', `/purchases/${purchaseId}`)).status === 404);
check('Purchase overpayment rejected', (await call(A, 'POST', `/purchases/${purchaseId}/pay`, { amount: 99999 })).status === 400);
const ppay = await call(A, 'POST', `/purchases/${purchaseId}/pay`, { amount: 1000, accountId: bank.id });
check('Partial supplier payment from bank', ppay.status === 200 && ppay.json.data?.status === 'partially_paid', JSON.stringify(ppay.json));
const pdetail = (await call(A, 'GET', `/purchases/${purchaseId}`)).json.data;
check('Purchase detail returns items + payments', pdetail.items.length === 1 && pdetail.payments[0].account === 'Bank Account');

// ---------- stock fixes ----------
const adj = await call(A, 'POST', '/stock/adjust', { productId: prod.id, quantity: 4, notes: 'Found in store' });
check('Positive adjustment no longer crashes', adj.status === 201, `${adj.status} ${JSON.stringify(adj.json)}`);
const before = (await call(A, 'GET', `/products/${prod.id}`)).json.data.quantity;
const dmg = await call(A, 'POST', '/stock/damage', { productId: prod.id, quantity: before + 100 });
check('Over-sized write-off rejected', dmg.status === 400);
check('Stock unchanged after rejected write-off', (await call(A, 'GET', `/products/${prod.id}`)).json.data.quantity === before);

// ---------- errors are JSON ----------
const nf = await call(A, 'GET', '/does-not-exist');
check('Unknown route returns JSON 404', nf.status === 404 && nf.json.success === false);
const bad = await call(A, 'POST', '/customers', {});
check('Customer validation error is JSON 400', bad.status === 400 && bad.json.success === false, JSON.stringify(bad));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
