-- CreateEnum
CREATE TYPE "ClientContactKind" AS ENUM ('EMAIL', 'PHONE');

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "kind" "ClientContactKind" NOT NULL,
    "value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "label" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_contacts_client_id_kind_sort_order_idx" ON "client_contacts"("client_id", "kind", "sort_order");

-- CreateIndex
CREATE INDEX "client_contacts_kind_normalized_value_idx" ON "client_contacts"("kind", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "client_contacts_client_id_kind_normalized_value_key" ON "client_contacts"("client_id", "kind", "normalized_value");

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill primary email from Client.email (case-insensitive trim as normalized)
INSERT INTO "client_contacts" (
  "id",
  "client_id",
  "kind",
  "value",
  "normalized_value",
  "label",
  "is_primary",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  'cct_' || md5(c."id" || ':EMAIL:' || lower(btrim(c."email"))),
  c."id",
  'EMAIL'::"ClientContactKind",
  btrim(c."email"),
  lower(btrim(c."email")),
  NULL,
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Client" c
WHERE c."email" IS NOT NULL AND btrim(c."email") <> '';

-- Backfill primary phone from Client.phone (digits-only normalized; keep leading +)
INSERT INTO "client_contacts" (
  "id",
  "client_id",
  "kind",
  "value",
  "normalized_value",
  "label",
  "is_primary",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  'cct_' || md5(c."id" || ':PHONE:' ||
    CASE
      WHEN left(btrim(c."phone"), 1) = '+' THEN '+' || regexp_replace(btrim(c."phone"), '\D', '', 'g')
      ELSE regexp_replace(btrim(c."phone"), '\D', '', 'g')
    END
  ),
  c."id",
  'PHONE'::"ClientContactKind",
  btrim(c."phone"),
  CASE
    WHEN left(btrim(c."phone"), 1) = '+' THEN '+' || regexp_replace(btrim(c."phone"), '\D', '', 'g')
    ELSE regexp_replace(btrim(c."phone"), '\D', '', 'g')
  END,
  NULL,
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Client" c
WHERE c."phone" IS NOT NULL
  AND btrim(c."phone") <> ''
  AND regexp_replace(btrim(c."phone"), '\D', '', 'g') <> '';
