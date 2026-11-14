/**
 * Stock check for every company in the database.
 *
 *   npm run stock:check            # read-only report
 *   npm run stock:check -- --fix   # also apply the safe fixes
 *
 * The safe fixes never guess quantities: they assign location-less batches to
 * the default location, create opening batches for stock that exists only on
 * the product record, and recompute cached values. Quantity mismatches are
 * listed for a physical count (Inventory → Stock Check → Count).
 */
import { prisma } from '../lib/prisma';
import { runStockCheck, fixSafeStockIssues } from '../lib/stockCheck';

async function main() {
  const fix = process.argv.includes('--fix');
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`Stock check — ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}${fix ? ' (applying safe fixes)' : ' (read-only)'}\n`);

  let totalIssues = 0;
  for (const c of companies) {
    const report = await runStockCheck(c.id);
    totalIssues += report.summary.issues;
    console.log(`■ ${c.name}`);
    console.log(
      `  products: ${report.summary.products}   issues: ${report.summary.issues} ` +
        `(fixable ${report.summary.fixable}, need count ${report.summary.needsCount})`
    );
    console.log(
      `  stock value from batches: ${report.summary.batchValueTotal}   ` +
        `Inventory account: ${report.summary.inventoryAccountBalance}   ` +
        `difference: ${report.summary.inventoryAccountDifference}`
    );
    for (const i of report.issues) {
      console.log(`  - [${i.fixable ? 'fixable' : 'COUNT  '}] ${i.productName}: ${i.message}`);
    }
    if (fix && report.summary.fixable > 0) {
      const r = await fixSafeStockIssues(c.id);
      console.log(
        `  ✓ fixed: ${r.batchesAssigned} batches assigned to default location, ` +
          `${r.openingBatchesCreated} opening batches created, ${r.productsResynced} products resynced`
      );
    }
    console.log('');
  }
  console.log(totalIssues === 0 ? 'No issues found.' : `${totalIssues} issue(s) found.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
