-- ClientReport: log of generated client reports (Monthly Pulse / Quarterly Review).
CREATE TABLE "client_reports" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PULSE',
    "lang" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_reports_client_id_kind_idx" ON "client_reports"("client_id", "kind");
CREATE INDEX "client_reports_client_id_status_idx" ON "client_reports"("client_id", "status");
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
