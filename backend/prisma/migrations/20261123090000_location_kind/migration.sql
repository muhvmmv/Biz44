-- Each branch is a factory (can produce) or a store (receives and sells).
-- Existing branches keep working exactly as before, as factories.
ALTER TABLE "locations" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'factory';
