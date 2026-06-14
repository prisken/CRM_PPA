-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('RELATIONSHIP', 'DOCTOR', 'ACCOUNT_SERVICE');

-- CreateTable
CREATE TABLE "client_assignments" (
    "assignment_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,

    CONSTRAINT "client_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- Migrate existing per-client user assignments before dropping columns
INSERT INTO "client_assignments" ("assignment_id", "client_id", "user_id", "role")
SELECT gen_random_uuid()::text, "id", "assignedRelationshipId", 'RELATIONSHIP'::"AssignmentRole"
FROM "Client"
WHERE "assignedRelationshipId" IS NOT NULL;

INSERT INTO "client_assignments" ("assignment_id", "client_id", "user_id", "role")
SELECT gen_random_uuid()::text, "id", "assignedDoctorId", 'DOCTOR'::"AssignmentRole"
FROM "Client"
WHERE "assignedDoctorId" IS NOT NULL;

INSERT INTO "client_assignments" ("assignment_id", "client_id", "user_id", "role")
SELECT gen_random_uuid()::text, "id", "assignedServiceId", 'ACCOUNT_SERVICE'::"AssignmentRole"
FROM "Client"
WHERE "assignedServiceId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_assignedAdminId_fkey";
ALTER TABLE "Client" DROP CONSTRAINT "Client_assignedRelationshipId_fkey";
ALTER TABLE "Client" DROP CONSTRAINT "Client_assignedDoctorId_fkey";
ALTER TABLE "Client" DROP CONSTRAINT "Client_assignedServiceId_fkey";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "assignedAdminId",
DROP COLUMN "assignedRelationshipId",
DROP COLUMN "assignedDoctorId",
DROP COLUMN "assignedServiceId";

-- AddForeignKey
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Simplify UserRole enum: SUPER_ADMIN and STANDARD_USER
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'STANDARD_USER');

ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'SUPER_ADMIN'::"UserRole_new"
    ELSE 'STANDARD_USER'::"UserRole_new"
  END
);

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
