-- CreateIndex
CREATE INDEX "Deal_clientId_status_idx" ON "Deal"("clientId", "status");

-- CreateIndex
CREATE INDEX "Interaction_clientId_date_idx" ON "Interaction"("clientId", "date");

-- CreateIndex
CREATE INDEX "activity_read_status_user_id_idx" ON "activity_read_status"("user_id");

-- CreateIndex
CREATE INDEX "client_activity_logs_client_id_created_at_idx" ON "client_activity_logs"("client_id", "created_at");
