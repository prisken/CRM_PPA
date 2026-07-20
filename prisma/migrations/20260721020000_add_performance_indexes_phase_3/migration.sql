-- Performance indexes phase 3 (additive, non-unique).
-- App behavior unchanged.
--
-- Deferred (do NOT add until data audited + cleaned):
--   UNIQUE (client_id) WHERE role = 'RELATIONSHIP'
--   UNIQUE (client_id) WHERE role = 'ACCOUNT_SERVICE'
--   UNIQUE (client_id, user_id, role)
-- Occupancy remains enforced in application code (ROLE_OCCUPANCY_LIMITS).
-- Preflight before a future unique migration:
--   SELECT client_id, role, COUNT(*) FROM client_assignments
--   WHERE role IN ('RELATIONSHIP', 'ACCOUNT_SERVICE')
--   GROUP BY client_id, role HAVING COUNT(*) > 1;

-- pg_trgm for ILIKE / contains search (LCC + global client search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Client B-tree indexes
CREATE INDEX IF NOT EXISTS "Client_status_idx" ON "Client"("status");
CREATE INDEX IF NOT EXISTS "Client_lastModified_idx" ON "Client"("lastModified");
CREATE INDEX IF NOT EXISTS "Client_status_lastModified_idx" ON "Client"("status", "lastModified");
CREATE INDEX IF NOT EXISTS "Client_status_next_follow_up_at_idx" ON "Client"("status", "next_follow_up_at");
CREATE INDEX IF NOT EXISTS "Client_company_idx" ON "Client"("company");
CREATE INDEX IF NOT EXISTS "Client_createdAt_idx" ON "Client"("createdAt");

-- Client trigram search indexes
CREATE INDEX IF NOT EXISTS "Client_name_trgm_idx" ON "Client" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Client_company_trgm_idx" ON "Client" USING GIN ("company" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Client_email_trgm_idx" ON "Client" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Client_phone_trgm_idx" ON "Client" USING GIN ("phone" gin_trgm_ops);

-- Contact value trigram (search contains on client_contacts.value)
CREATE INDEX IF NOT EXISTS "client_contacts_value_trgm_idx"
  ON "client_contacts" USING GIN ("value" gin_trgm_ops);

-- Client assignments (auth, occupancy counts, nested includes)
CREATE INDEX IF NOT EXISTS "client_assignments_client_id_idx"
  ON "client_assignments"("client_id");
CREATE INDEX IF NOT EXISTS "client_assignments_client_id_user_id_idx"
  ON "client_assignments"("client_id", "user_id");
CREATE INDEX IF NOT EXISTS "client_assignments_client_id_role_idx"
  ON "client_assignments"("client_id", "role");
CREATE INDEX IF NOT EXISTS "client_assignments_user_id_role_idx"
  ON "client_assignments"("user_id", "role");

-- Deal / participant composites
CREATE INDEX IF NOT EXISTS "Deal_clientId_status_updatedAt_idx"
  ON "Deal"("clientId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "DealParticipant_userId_role_idx"
  ON "DealParticipant"("userId", "role");
CREATE INDEX IF NOT EXISTS "DealParticipant_dealId_role_idx"
  ON "DealParticipant"("dealId", "role");

-- Important dates (range-first calendar scans)
CREATE INDEX IF NOT EXISTS "client_important_dates_scheduled_at_client_id_idx"
  ON "client_important_dates"("scheduled_at", "client_id");

-- Tasks / documents / returnables / source records / notifications
CREATE INDEX IF NOT EXISTS "tasks_client_id_idx" ON "tasks"("client_id");
CREATE INDEX IF NOT EXISTS "client_documents_client_id_idx" ON "client_documents"("client_id");
CREATE INDEX IF NOT EXISTS "CommissionReturnable_dealId_idx" ON "CommissionReturnable"("dealId");
CREATE INDEX IF NOT EXISTS "client_source_records_client_id_received_at_idx"
  ON "client_source_records"("client_id", "received_at");
CREATE INDEX IF NOT EXISTS "notifications_recipient_user_id_timestamp_idx"
  ON "notifications"("recipient_user_id", "timestamp");
CREATE INDEX IF NOT EXISTS "notifications_recipient_user_id_is_read_idx"
  ON "notifications"("recipient_user_id", "is_read");

-- Activity log author timeline (optional author-scoped queries)
CREATE INDEX IF NOT EXISTS "client_activity_logs_user_id_created_at_idx"
  ON "client_activity_logs"("user_id", "created_at");

-- Projection milestones ordered by year then sortOrder
CREATE INDEX IF NOT EXISTS "ClientStrategyProjectionMilestone_strategyPlanId_year_sortOrder_idx"
  ON "ClientStrategyProjectionMilestone"("strategyPlanId", "year", "sortOrder");
