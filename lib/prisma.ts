// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

// Declare a global variable to hold the Prisma Client instance
declare global {
  var prisma: PrismaClient | undefined;
}

// This code prevents multiple instances of Prisma Client in development
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: ['query'], // Log queries to the console for debugging
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
