-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "inventory_batches" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "leaves" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "payrolls" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_location_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_location_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_companyId_status_idx" ON "locations"("companyId", "status");

-- CreateIndex
CREATE INDEX "user_location_access_userId_idx" ON "user_location_access"("userId");

-- CreateIndex
CREATE INDEX "user_location_access_locationId_idx" ON "user_location_access"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_location_access_userId_locationId_key" ON "user_location_access"("userId", "locationId");

-- CreateIndex
CREATE INDEX "invoices_companyId_locationId_idx" ON "invoices"("companyId", "locationId");

-- CreateIndex
CREATE INDEX "payments_companyId_locationId_idx" ON "payments"("companyId", "locationId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_locationId_idx" ON "stock_movements"("companyId", "locationId");

-- CreateIndex
CREATE INDEX "transactions_companyId_locationId_idx" ON "transactions"("companyId", "locationId");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_location_access" ADD CONSTRAINT "user_location_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_location_access" ADD CONSTRAINT "user_location_access_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
