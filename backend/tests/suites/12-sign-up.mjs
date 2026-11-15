// Sign-up validation and sign-in responses.
const B = process.env.TEST_API_URL || 'http://localhost:4100/api';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${!c ? `  -> ${d}` : ''}`); };
const post = async (p, b) => { const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); return { status: r.status, data: j.data, message: j.message }; };
const stamp = Date.now();
const base = { firstName: 'Ada', lastName: 'Okoro', email: `Signup-${stamp}@Example.test`, password: 'Password123!', company: 'Okoro Mills' };

let r = await post('/auth/register', { ...base, password: 'short' });
check('short password refused', r.status === 400 && /8 characters/.test(r.message), `${r.status} ${r.message}`);
r = await post('/auth/register', { ...base, email: 'not-an-email' });
check('bad email refused', r.status === 400, r.status);
r = await post('/auth/register', { ...base, firstName: '  ' });
check('missing name refused', r.status === 400, r.status);
r = await post('/auth/register', base);
check('valid sign-up works', r.status === 201 && !!r.data?.token, `${r.status} ${r.message}`);
check('email stored in lower case', r.data?.user?.email === base.email.toLowerCase(), r.data?.user?.email);
r = await post('/auth/register', { ...base, email: base.email.toUpperCase() });
check('same email in other case refused', r.status === 400 && /already exists/.test(r.message), `${r.status} ${r.message}`);
r = await post('/auth/login', { email: base.email, password: 'Password123!' });
check('sign in (any case)', r.status === 200 && !!r.data?.token, r.status);
r = await post('/auth/login', { email: base.email, password: 'wrong-password' });
check('wrong password is 401, not a server error', r.status === 401 && /Incorrect/.test(r.message), `${r.status} ${r.message}`);
r = await post('/auth/login', { email: `nobody-${stamp}@example.test`, password: 'whatever1' });
check('unknown email is 401', r.status === 401, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
