// Runs the API test suites against a real PostgreSQL database.
//
//   TEST_DATABASE_URL=postgresql://user@host:5432/biz44_test npm test
//   npm test -- 04          (only suites whose file name contains "04")
//
// The database is migrated with `prisma migrate deploy` and then used as is:
// every suite registers its own new company, so existing rows are left alone.
// As a guard, the database name must contain "test" unless TEST_ALLOW_ANY_DB=1.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, '..');
const dbUrl = process.env.TEST_DATABASE_URL;
const port = process.env.TEST_PORT || '4199';
const apiUrl = `http://127.0.0.1:${port}/api`;

if (!dbUrl) {
  console.error('Set TEST_DATABASE_URL to a PostgreSQL database for tests, e.g. postgresql://postgres@127.0.0.1:5432/biz44_test');
  process.exit(2);
}
const dbName = new URL(dbUrl).pathname.replace(/^\//, '');
if (!/test/i.test(dbName) && process.env.TEST_ALLOW_ANY_DB !== '1') {
  console.error(`Refusing to run against "${dbName}": the test database name must contain "test" (or set TEST_ALLOW_ANY_DB=1).`);
  process.exit(2);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const env = { ...process.env, DATABASE_URL: dbUrl };

console.log(`Migrating ${dbName}...`);
const migrate = spawnSync(npx, ['prisma', 'migrate', 'deploy'], { cwd: backend, env, stdio: 'inherit' });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

// A server left on the port (e.g. from an interrupted run) would answer
// instead of the one started here.
try {
  await fetch(`${apiUrl}/health`);
  console.error(`Port ${port} is already in use. Stop whatever is running there, or set TEST_PORT.`);
  process.exit(2);
} catch { /* free */ }

console.log(`Starting the API on port ${port}...`);
const server = spawn(npx, ['ts-node-dev', '--transpile-only', 'src/index.ts'], {
  cwd: backend,
  env: {
    ...env,
    PORT: port,
    NODE_ENV: 'test',
    JWT_SECRET: process.env.TEST_JWT_SECRET || 'test-only-secret-not-for-production',
    CORS_ORIGIN: 'http://localhost:3100',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  // Own process group, so stopping it also stops the node process npx started.
  detached: process.platform !== 'win32',
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

const stop = () => {
  if (server.exitCode !== null) return;
  try {
    if (process.platform !== 'win32') process.kill(-server.pid, 'SIGTERM');
    else server.kill('SIGTERM');
  } catch { /* already gone */ }
};
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${apiUrl}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    if (server.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  console.error('The API did not start:\n' + serverLog.slice(-4000));
  process.exit(1);
}

await waitForApi();

const filter = process.argv[2];
const suites = readdirSync(join(here, 'suites'))
  .filter((f) => f.endsWith('.mjs') && (!filter || f.includes(filter)))
  .sort();

const results = [];
for (const file of suites) {
  console.log(`\n=== ${file}`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [join(here, 'suites', file)], {
    env: { ...process.env, TEST_API_URL: apiUrl, TEST_DATABASE_URL: dbUrl },
    encoding: 'utf8',
  });
  const out = (r.stdout || '') + (r.stderr || '');
  // Show failures in full; passing checks are summarised.
  const lines = out.split('\n');
  for (const line of lines) {
    if (!/^PASS\b/.test(line.trim()) && line.trim()) console.log(line);
  }
  const m = out.match(/(\d+) passed, (\d+) failed/);
  results.push({ file, ok: r.status === 0, passed: m ? +m[1] : 0, failed: m ? +m[2] : 0, seconds: ((Date.now() - started) / 1000).toFixed(1) });
}

stop();
console.log('\nSummary');
for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.file.padEnd(36)} ${String(r.passed).padStart(3)} passed  ${r.failed} failed  ${r.seconds}s`);
const total = results.reduce((s, r) => s + r.passed, 0);
const failed = results.filter((r) => !r.ok);
console.log(`\n${total} checks passed${failed.length ? `, ${failed.length} suite(s) failed` : ''}.`);
if (failed.length && serverLog) console.log('\nLast API output:\n' + serverLog.slice(-3000));
process.exit(failed.length ? 1 : 0);
