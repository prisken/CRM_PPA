-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linked_client_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_linked_client_id_fkey" FOREIGN KEY ("linked_client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
