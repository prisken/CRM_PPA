-- CreateTable
CREATE TABLE "activity_read_status" (
    "activity_log_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_read_status_pkey" PRIMARY KEY ("activity_log_id","user_id")
);

-- AddForeignKey
ALTER TABLE "activity_read_status" ADD CONSTRAINT "activity_read_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
