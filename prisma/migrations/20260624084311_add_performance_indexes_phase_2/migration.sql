-- CreateIndex
CREATE INDEX "CommissionReturnable_userId_status_period_idx" ON "CommissionReturnable"("userId", "status", "period");

-- CreateIndex
CREATE INDEX "Deal_status_updatedAt_idx" ON "Deal"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "client_assignments_user_id_idx" ON "client_assignments"("user_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_status_due_date_idx" ON "tasks"("assignee_id", "status", "due_date");
