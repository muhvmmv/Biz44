-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teamSize" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT;
