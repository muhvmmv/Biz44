-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "productionOrderId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "depositId" TEXT;

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "unitPrice" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "customer_deposits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "customerId" TEXT NOT NULL,
    "productionOrderId" TEXT,
    "number" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "appliedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "accountName" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_deposits_customerId_idx" ON "customer_deposits"("customerId");

-- CreateIndex
CREATE INDEX "customer_deposits_productionOrderId_idx" ON "customer_deposits"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_deposits_companyId_number_key" ON "customer_deposits"("companyId", "number");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "customer_deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_deposits" ADD CONSTRAINT "customer_deposits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_deposits" ADD CONSTRAINT "customer_deposits_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_deposits" ADD CONSTRAINT "customer_deposits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_deposits" ADD CONSTRAINT "customer_deposits_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

