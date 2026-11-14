const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { quantity: { gt: 0 } },
  });

  console.log(`Backfilling ${products.length} products with opening batches...`);

  let created = 0;
  for (const p of products) {
    const existing = await prisma.inventoryBatch.findFirst({
      where: { productId: p.id, isLegacy: true },
    });
    if (existing) continue;

    await prisma.inventoryBatch.create({
      data: {
        companyId: p.companyId,
        productId: p.id,
        quantityReceived: p.quantity,
        quantityRemaining: p.quantity,
        unitCost: p.cost,
        sellingPriceSnapshot: p.price,
        reference: 'Opening balance (migrated)',
        isLegacy: true,
        receivedAt: p.createdAt,
      },
    });
    created++;
  }

  console.log(`Created ${created} opening batches.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());