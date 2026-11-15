// Customer returns and credit notes: values after discount with VAT, applied
// to the balance or refunded, stock back to the original batches, ledger,
// VAT, statements, margins and safeguards.
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

const reg = await call(null, 'POST', '/auth/register', { firstName: 'Cn', lastName: 'Admin', email: `cn-${stamp}@example.test`, password: 'Password123!', company: 'Credit Mills' });
const A = reg.data.token;
await ok(A, 'POST', '/settings/onboarding', { businessType: 'manufacturing', currency: 'NGN' });
await ok(A, 'PUT', '/settings/company', { vatRate: 7.5 });
const accts = await ok(A, 'GET', '/accounting/accounts');
const bank = accts.find((a) => a.subtype === 'bank');
await ok(A, 'POST', '/accounting/journal', { description: 'Capital', lines: [{ accountId: bank.id, debit: 2000000 }, { accountId: accts.find((a) => a.systemKey === 'owner_capital').id, credit: 2000000 }] });
const flour = await ok(A, 'POST', '/products', { name: 'Flour 10kg', itemType: 'finished_good', unit: 'bag', price: 5000 });
await ok(A, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 100, unitCost: 3000 }], paymentStatus: 'paid', paymentAccountId: bank.id, reference: 'GRN-A' });
await new Promise((r) => setTimeout(r, 20));
await ok(A, 'POST', '/stock/receive', { items: [{ productId: flour.id, quantity: 50, unitCost: 3200 }], paymentStatus: 'paid', paymentAccountId: bank.id, reference: 'GRN-B' });
const cust = await ok(A, 'POST', '/customers', { firstName: 'Bello', lastName: 'Stores' });

// 120 bags × 5,000 = 600,000; 10% discount → 540,000; VAT 7.5% → 40,500; total 580,500
const inv = await ok(A, 'POST', '/invoices', { customerId: cust.id, discountType: 'percent', discountValue: 10, items: [{ productId: flour.id, description: 'Flour 10kg', quantity: 120, unitPrice: 5000 }] });
const item = inv.items[0];
let r = await call(A, 'POST', `/invoices/${inv.id}/credit-notes`, { items: [{ invoiceItemId: item.id, quantity: 1 }] });
check('draft invoice cannot be credited', r.status === 400, r.status);
await ok(A, 'POST', `/invoices/${inv.id}/finalize`, { payment: { amount: 200000, accountId: bank.id } });
let pl = await ok(A, 'GET', '/accounting/profit-loss');
check('sale: revenue 540,000, COGS 100×3,000 + 20×3,200 = 364,000', near(pl.revenue, 540000) && near(pl.cogs, 364000), `${pl.revenue} ${pl.cogs}`);

const creditable = await ok(A, 'GET', `/invoices/${inv.id}/creditable`);
check('creditable: 120 available at 4,500 after discount', creditable[0].available === 120 && near(creditable[0].unitPrice, 4500), JSON.stringify(creditable[0]));

// ---------- CN-0001: 10 bags back to stock
const cn1 = await ok(A, 'POST', `/invoices/${inv.id}/credit-notes`, { items: [{ invoiceItemId: item.id, quantity: 10, restock: true }], reason: 'Torn bags' });
check('CN-0001 value 45,000 + VAT 3,375 = 48,375', cn1.number === 'CN-0001' && near(cn1.subtotal, 45000) && near(cn1.taxTotal, 3375) && near(cn1.total, 48375), JSON.stringify([cn1.number, cn1.subtotal, cn1.taxTotal, cn1.total]));
check('CN-0001 reduces the balance, no refund', near(cn1.appliedAmount, 48375) && cn1.refundAmount === 0);
check('restocked into the last batch used (10 × 3,200)', near(cn1.costReturned, 32000), cn1.costReturned);
let invNow = await ok(A, 'GET', `/invoices/${inv.id}`);
check('invoice untouched, credited 48,375', invNow.total === 580500 && near(invNow.creditedAmount, 48375) && invNow.status === 'partially_paid', JSON.stringify([invNow.total, invNow.creditedAmount, invNow.status]));
pl = await ok(A, 'GET', '/accounting/profit-loss');
check('P&L: revenue 495,000, COGS 332,000', near(pl.revenue, 495000) && near(pl.cogs, 332000), `${pl.revenue} ${pl.cogs}`);
let vat = await ok(A, 'GET', '/accounting/vat');
check('VAT owed 40,500 − 3,375 = 37,125', near(vat.owed, 37125) && near(vat.period.reversed, 3375), `${vat.owed} ${vat.period.reversed}`);
let recv = await ok(A, 'GET', '/accounting/receivable');
const recvRows = recv.invoices ?? recv.rows ?? recv;
const recvRow = Array.isArray(recvRows) ? recvRows.find((x) => x.id === inv.id || x.invoiceNumber === inv.invoiceNumber) : null;
check('receivables show 332,125 owed', recvRow && near(recvRow.balance, 332125), JSON.stringify(recvRow));

// ---------- CN-0002: 5 damaged bags, credited but not restocked
const levelBefore = (await ok(A, 'GET', `/products/${flour.id}`)).quantity;
const cn2 = await ok(A, 'POST', `/invoices/${inv.id}/credit-notes`, { items: [{ invoiceItemId: item.id, quantity: 5, restock: false }], reason: 'Damaged, destroyed' });
check('CN-0002 22,500 + 1,687.50 = 24,187.50, nothing restocked', near(cn2.total, 24187.5) && cn2.costReturned === 0 && cn2.lines[0].restocked === false, JSON.stringify([cn2.total, cn2.costReturned]));
check('stock unchanged by a credit without restock', (await ok(A, 'GET', `/products/${flour.id}`)).quantity === levelBefore);

// ---------- over-crediting refused (105 left)
r = await call(A, 'POST', `/invoices/${inv.id}/credit-notes`, { items: [{ invoiceItemId: item.id, quantity: 106 }] });
check('crediting more than was sold refused', r.status === 400 && /105/.test(r.message), `${r.status} ${r.message}`);
r = await call(A, 'POST', `/invoices/${inv.id}/credit-notes`, { items: [{ invoiceItemId: item.id, quantity: 0 }] });
check('empty credit note refused', r.status === 400, r.status);
r = await call(A, 'POST', `/invoices/${inv.id}/cancel`, {});
check('invoice with credit notes cannot be cancelled', r.status === 400 && /credit note/i.test(r.message), `${r.status} ${r.message}`);

// ---------- pay the rest: 580,500 − 200,000 − 48,375 − 24,187.50 = 307,937.50
r = await call(A, 'POST', `/invoices/${inv.id}/payment`, { amount: 307940, accountId: bank.id });
check('payment above what is left refused', r.status === 400, r.status);
await ok(A, 'POST', `/invoices/${inv.id}/payment`, { amount: 307937.5, accountId: bank.id });
invNow = await ok(A, 'GET', `/invoices/${inv.id}`);
check('fully settled → paid', invNow.status === 'paid', invNow.status);

// ---------- CN-0003 after payment: 15 bags back, refunded
r = await call(A, 'POST', `/invoices/${inv.id}/credit-notes`, { items: [{ invoiceItemId: item.id, quantity: 15, restock: true }] });
check('refund needs an account when already paid', r.status === 400 && /refund/i.test(r.message), `${r.status} ${r.message}`);
const bankBefore = (await ok(A, 'GET', '/accounting/accounts')).find((a) => a.id === bank.id).balance;
const cn3 = await ok(A, 'POST', `/invoices/${inv.id}/credit-notes`, { items: [{ invoiceItemId: item.id, quantity: 15, restock: true }], refundAccountId: bank.id });
check('CN-0003 72,562.50 all refunded', near(cn3.total, 72562.5) && near(cn3.refundAmount, 72562.5) && cn3.appliedAmount === 0, JSON.stringify([cn3.total, cn3.appliedAmount, cn3.refundAmount]));
check('restocked 10 × 3,200 then 5 × 3,000 = 47,000', near(cn3.costReturned, 47000), cn3.costReturned);
const bankAfter = (await ok(A, 'GET', '/accounting/accounts')).find((a) => a.id === bank.id).balance;
check('bank paid out 72,562.50', near(bankBefore - bankAfter, 72562.5), bankBefore - bankAfter);
invNow = await ok(A, 'GET', `/invoices/${inv.id}`);
check('invoice: paid 435,375, credited 145,125, nothing owed', near(invNow.amountPaid, 435375) && near(invNow.creditedAmount, 145125) && invNow.status === 'paid' && invNow.creditNotes.length === 3, JSON.stringify([invNow.amountPaid, invNow.creditedAmount, invNow.status]));
check('refund in payment history', invNow.payments.some((p) => near(p.amount, -72562.5) && p.reference === 'CN-0003'));
const levels = await ok(A, 'GET', `/products/${flour.id}`);
check('stock: 150 − 120 + 10 + 15 = 55', levels.quantity === 55, levels.quantity);

// ---------- everything agrees
pl = await ok(A, 'GET', '/accounting/profit-loss');
check('P&L: revenue 405,000, COGS 285,000', near(pl.revenue, 405000) && near(pl.cogs, 285000), `${pl.revenue} ${pl.cogs}`);
const margins = await ok(A, 'GET', '/reports/product-margins');
const fm = margins.products.find((p) => p.name === 'Flour 10kg');
check('margin report: 90 bags net, 405,000 sales, 285,000 cost', fm && near(fm.quantity, 90) && near(fm.revenue, 405000) && near(fm.cost, 285000), JSON.stringify(fm));
vat = await ok(A, 'GET', '/accounting/vat');
check('VAT owed 40,500 − 3,375 − 1,687.50 − 5,062.50 = 30,375', near(vat.owed, 30375), vat.owed);
const st = await ok(A, 'GET', `/customers/${cust.id}/statement`);
check('statement closes at 0 with 3 credit lines', near(st.closingBalance, 0) && st.lines.filter((l) => l.type === 'credit').length === 3, JSON.stringify([st.closingBalance, st.lines.map((l) => l.type)]));
const summary = await ok(A, 'GET', `/customers/${cust.id}/summary`);
check('customer summary: nothing outstanding', near(summary.summary.outstanding, 0), summary.summary.outstanding);
const tb = await ok(A, 'GET', '/accounting/trial-balance');
check('trial balance balanced', tb.balanced);
const sc = await ok(A, 'GET', '/stock/check');
check('stock check clean', sc.summary.issues === 0 && Math.abs(sc.summary.inventoryAccountDifference) < 0.01, JSON.stringify(sc.summary));
const sm = (await ok(A, 'GET', '/reports/stock-movement')).find((x) => x.name === 'Flour 10kg');
check('stock movement: sold net of returns −95', sm && sm.sold === -95 && sm.closing === 55, JSON.stringify(sm));

// ---------- custom line (price adjustment, no stock)
const inv2 = await ok(A, 'POST', '/invoices', { customerId: cust.id, taxRate: 0, items: [{ productId: null, description: 'Delivery', quantity: 1, unitPrice: 10000 }] });
await ok(A, 'POST', `/invoices/${inv2.id}/finalize`, {});
const cn4 = await ok(A, 'POST', `/invoices/${inv2.id}/credit-notes`, { items: [{ invoiceItemId: inv2.items[0].id, quantity: 0.5 }], reason: 'Late delivery discount' });
check('credit on a service line: 5,000, no stock, no VAT', near(cn4.total, 5000) && cn4.costReturned === 0 && cn4.taxTotal === 0, JSON.stringify(cn4));
const inv2Now = await ok(A, 'GET', `/invoices/${inv2.id}`);
check('service invoice now owes 5,000', inv2Now.status === 'unpaid' && near(inv2Now.total - inv2Now.amountPaid - inv2Now.creditedAmount, 5000));

// ---------- roles and isolation
const mk = async (role) => {
  const email = `cn-${role}-${stamp}@example.test`;
  const locs = await ok(A, 'GET', '/locations');
  await ok(A, 'POST', '/users', { firstName: role, lastName: 'U', email, password: 'Password123!', role, locationIds: [locs[0].id] });
  return (await call(null, 'POST', '/auth/login', { email, password: 'Password123!' })).data.token;
};
const S = await mk('sales');
r = await call(S, 'POST', `/invoices/${inv2.id}/credit-notes`, { items: [{ invoiceItemId: inv2.items[0].id, quantity: 0.1 }] });
check('sales role can issue a credit note', r.status === 201, `${r.status} ${r.message}`);
check('CN numbers continue (CN-0005)', r.data?.number === 'CN-0005', r.data?.number);
const K = await mk('storekeeper');
r = await call(K, 'POST', `/invoices/${inv2.id}/credit-notes`, { items: [{ invoiceItemId: inv2.items[0].id, quantity: 0.1 }] });
check('storekeeper cannot issue credit notes', r.status === 403, r.status);
const other = await call(null, 'POST', '/auth/register', { firstName: 'O', lastName: 'T', email: `cn-o-${stamp}@example.test`, password: 'Password123!', company: 'Other' });
r = await call(other.data.token, 'POST', `/invoices/${inv2.id}/credit-notes`, { items: [{ invoiceItemId: inv2.items[0].id, quantity: 0.1 }] });
check('another company cannot credit our invoice', r.status === 404, r.status);

// ---------- concurrent credit notes cannot over-credit
const inv3 = await ok(A, 'POST', '/invoices', { customerId: cust.id, taxRate: 0, items: [{ productId: flour.id, description: 'Flour', quantity: 4, unitPrice: 5000 }] });
await ok(A, 'POST', `/invoices/${inv3.id}/finalize`, {});
const both = await Promise.all([1, 2].map(() => call(A, 'POST', `/invoices/${inv3.id}/credit-notes`, { items: [{ invoiceItemId: inv3.items[0].id, quantity: 3 }] })));
check('two credit notes at once: only one fits', both.filter((x) => x.status === 201).length === 1, both.map((x) => `${x.status} ${x.message ?? ''}`).join(' | '));
const inv3Now = await ok(A, 'GET', `/invoices/${inv3.id}`);
check('inv3 credited once (15,000)', near(inv3Now.creditedAmount, 15000), inv3Now.creditedAmount);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
