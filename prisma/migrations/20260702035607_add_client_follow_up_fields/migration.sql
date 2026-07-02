-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "next_action" TEXT,
ADD COLUMN     "next_follow_up_at" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT;

-- CreateIndex
CREATE INDEX "Client_next_follow_up_at_idx" ON "Client"("next_follow_up_at");
