-- CreateEnum
CREATE TYPE "LeadSourceType" AS ENUM ('GOOGLE_FORMS', 'PROFIT_PULSE_ALLY', 'MANUAL', 'OTHER');

-- CreateTable
CREATE TABLE "client_source_records" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "source" "LeadSourceType" NOT NULL,
    "external_id" TEXT,
    "normalized_email" TEXT,
    "normalized_phone" TEXT,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_merge_audits" (
    "id" TEXT NOT NULL,
    "canonical_client_id" TEXT NOT NULL,
    "merged_client_id" TEXT,
    "merged_by_user_id" TEXT,
    "merge_type" TEXT NOT NULL,
    "reason" TEXT,
    "field_changes" JSONB,
    "conflicts" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_merge_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_source_records_client_id_idx" ON "client_source_records"("client_id");

-- CreateIndex
CREATE INDEX "client_source_records_source_idx" ON "client_source_records"("source");

-- CreateIndex
CREATE INDEX "client_source_records_normalized_email_idx" ON "client_source_records"("normalized_email");

-- CreateIndex
CREATE INDEX "client_source_records_normalized_phone_idx" ON "client_source_records"("normalized_phone");

-- CreateIndex
CREATE UNIQUE INDEX "client_source_records_source_external_id_key" ON "client_source_records"("source", "external_id");

-- AddForeignKey
ALTER TABLE "client_source_records" ADD CONSTRAINT "client_source_records_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
