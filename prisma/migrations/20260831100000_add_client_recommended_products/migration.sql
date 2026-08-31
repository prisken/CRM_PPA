-- Add recommendedProducts to Client for the curated product shortlist widget.
-- SURGICAL: only the intended column (prisma migrate dev would also try to
-- reconcile unrelated drift — never let it).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "recommended_products" JSONB DEFAULT '[]';
