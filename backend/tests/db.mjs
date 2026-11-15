// Direct database access for tests that need to set up or inspect raw rows.
// Uses the backend's own Prisma client and TEST_DATABASE_URL.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is not set (run the tests with `npm test`)');
const prisma = new PrismaClient({ datasources: { db: { url } } });

/** Run SQL and return the first column of the first row as a string ('' when none), like `psql -tAc`. */
export async function sql(query) {
  const rows = await prisma.$queryRawUnsafe(query);
  if (!Array.isArray(rows)) return String(rows);
  if (rows.length === 0) return '';
  const value = Object.values(rows[0])[0];
  return value === null || value === undefined ? '' : String(value);
}

export async function disconnect() {
  await prisma.$disconnect();
}
