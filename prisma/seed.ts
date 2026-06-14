import { PrismaClient, UserRole } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const defaultPassword = "password123";

const users = [
  {
    email: "admin@example.com",
    name: "Super Admin",
    role: UserRole.SUPER_ADMIN,
  },
  {
    email: "relationship@example.com",
    name: "Relationship Specialist",
    role: UserRole.RELATIONSHIP,
  },
  {
    email: "doctor@example.com",
    name: "Doctor",
    role: UserRole.DOCTOR,
  },
  {
    email: "service@example.com",
    name: "Service Specialist",
    role: UserRole.SERVICE,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        password: passwordHash,
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        password: passwordHash,
      },
    });
  }

  console.log("Seeded users (password for all: password123):");
  for (const user of users) {
    console.log(`- ${user.email} (${user.role})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
