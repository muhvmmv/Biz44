-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "ledgerStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "subtype" TEXT,
ADD COLUMN     "systemKey" TEXT;

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "reference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "memo" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_entries_companyId_date_idx" ON "journal_entries"("companyId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_sourceType_sourceId_idx" ON "journal_entries"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "journal_lines_companyId_accountId_idx" ON "journal_lines"("companyId", "accountId");

-- CreateIndex
CREATE INDEX "journal_lines_entryId_idx" ON "journal_lines"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_companyId_systemKey_key" ON "accounts"("companyId", "systemKey");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Data: label existing accounts with their system role, code and subtype.
-- Only the new columns are filled; names and balances are not changed.
-- If a company has duplicate accounts with the same name, the oldest one
-- gets the role (systemKey is unique per company).
-- ---------------------------------------------------------------------------
WITH roles(name, key, code) AS (
  VALUES
    ('Cash', 'cash', '1000'),
    ('Accounts Receivable', 'ar', '1100'),
    ('Inventory', 'inventory', '1200'),
    ('Accounts Payable', 'ap', '2000'),
    ('Sales Revenue', 'sales', '4000'),
    ('Cost of Goods Sold', 'cogs', '5000'),
    ('Operating Expenses', 'operating_expenses', '6000'),
    ('Rent Expense', 'rent', '6100'),
    ('Utilities Expense', 'utilities', '6200'),
    ('Salary Expense', 'salaries', '6300'),
    ('Inventory Loss', 'inventory_loss', '6800'),
    ('General Expense', 'general_expense', '6900')
),
firsts AS (
  SELECT DISTINCT ON (a."companyId", a.name) a.id, r.key, r.code
  FROM "accounts" a
  JOIN roles r ON r.name = a.name
  ORDER BY a."companyId", a.name, a."createdAt", a.id
)
UPDATE "accounts" a
SET "systemKey" = f.key, "code" = f.code
FROM firsts f
WHERE a.id = f.id;

-- Money-holding asset accounts: the system Cash account is "cash"; every other
-- asset account except receivables and inventory holds money too.
UPDATE "accounts" SET "subtype" = 'cash' WHERE "systemKey" = 'cash';
UPDATE "accounts"
SET "subtype" = CASE WHEN name ILIKE '%bank%' THEN 'bank' ELSE 'cash' END
WHERE type = 'asset' AND "subtype" IS NULL
  AND name NOT IN ('Accounts Receivable', 'Inventory')
  AND ("systemKey" IS NULL OR "systemKey" NOT IN ('ar', 'inventory'));
UPDATE "accounts" SET "code" = '1010' WHERE "subtype" = 'bank' AND "code" IS NULL AND name = 'Bank Account';
