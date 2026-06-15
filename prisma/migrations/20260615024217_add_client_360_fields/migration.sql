-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "employee_count" INTEGER,
ADD COLUMN     "expectations" TEXT,
ADD COLUMN     "important_dates" JSONB DEFAULT '[]',
ADD COLUMN     "role_in_company" TEXT;
