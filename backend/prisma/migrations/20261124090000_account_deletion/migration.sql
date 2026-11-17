-- When a person deleted their account. Their name and email are removed;
-- the records they created stay with the company.
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);
