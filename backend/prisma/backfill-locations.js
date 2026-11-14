const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();
  console.log(`Processing ${companies.length} companies...`);

  for (const c of companies) {
    let defaultLoc = await prisma.location.findFirst({
      where: { companyId: c.id, isDefault: true },
    });

    if (!defaultLoc) {
      defaultLoc = await prisma.location.create({
        data: {
          companyId: c.id,
          name: c.name || 'Main',
          city: c.country || null,
          address: c.address || null,
          phone: c.phone || null,
          email: c.email || null,
          isDefault: true,
        },
      });
      console.log(`  ✓ Created default location "${defaultLoc.name}" for ${c.name}`);
    }

    const users = await prisma.user.findMany({ where: { companyId: c.id } });
    for (const u of users) {
      const exists = await prisma.userLocationAccess.findFirst({
        where: { userId: u.id, locationId: defaultLoc.id },
      });
      if (!exists) {
        await prisma.userLocationAccess.create({
          data: { userId: u.id, locationId: defaultLoc.id },
        });
        console.log(`  ✓ Granted access to ${u.email}`);
      }
    }

    await prisma.invoice.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
    await prisma.payment.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
    await prisma.transaction.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
    await prisma.stockMovement.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
    await prisma.purchase.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
    await prisma.inventoryBatch.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
    await prisma.attendance.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
    await prisma.leave.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
    await prisma.payroll.updateMany({
      where: { companyId: c.id, locationId: null },
      data: { locationId: defaultLoc.id },
    });
  }

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());