import { Prisma } from '@prisma/client';

/**
 * Permanently removes a company and everything it owns. Used only when the
 * company's administrator deletes the company (account deletion).
 *
 * Tables are emptied children-first so no foreign key blocks the delete.
 * Line tables (invoice items, journal lines, BOM lines, ...) go with their
 * parent through ON DELETE CASCADE.
 */
export async function eraseCompany(tx: Prisma.TransactionClient, companyId: string) {
  const del = (table: string) =>
    tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "companyId" = $1`, companyId);

  // Production issues point at stock batches; remove them (via their
  // materials) before the batches.
  await tx.$executeRawUnsafe(
    `DELETE FROM "production_materials" WHERE "orderId" IN (SELECT "id" FROM "production_orders" WHERE "companyId" = $1)`,
    companyId
  );

  for (const table of [
    'credit_notes',        // lines point at invoice items
    'payments',            // point at invoices and deposits
    'purchase_payments',
    'stock_movements',     // point at batches and products
    'invoices',
    'customer_deposits',
    'inventory_batches',
    'production_orders',
    'stock_transfers',
    'boms',
    'purchases',
    'journal_entries',     // lines go with them
    'journal_lines',
    'transactions',
    'accounts',
    'payrolls',
    'attendance',
    'leaves',
    'employees',
    'report_notes',
    'products',
    'customers',
    'suppliers',
    'users',               // location access goes with them
    'locations',
  ]) {
    await del(table);
  }
  await tx.$executeRawUnsafe(`DELETE FROM "Company" WHERE "id" = $1`, companyId);
}
