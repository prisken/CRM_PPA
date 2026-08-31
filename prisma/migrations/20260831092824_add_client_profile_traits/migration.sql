-- Add profile_traits to Client for the product-recommendation trait picker.
-- SURGICAL migration: only the intended column. The original auto-generated
-- version also dropped trgm search indexes / altered defaults / renamed
-- indexes (Prisma drift noise) — those were reverted manually and must NOT
-- be replayed. Keep this file to the single ALTER TABLE.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "profile_traits" JSONB DEFAULT '[]';
