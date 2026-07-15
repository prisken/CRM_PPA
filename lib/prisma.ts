// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log: ['query'], // Log queries to the console for debugging
  });
}

/**
 * After `prisma generate` / schema model additions, Next.js HMR can keep a
 * stale `global.prisma` singleton missing new delegates (e.g. clientImportantDate).
 * Recreate when expected delegates are absent so Client 360 / calendar keep working.
 */
function isPrismaClientCurrent(client: PrismaClient): boolean {
  return (
    typeof client.client?.findUnique === 'function' &&
    typeof client.clientImportantDate?.findMany === 'function' &&
    typeof client.clientStrategyPlan?.findMany === 'function' &&
    typeof client.dealParticipant?.findMany === 'function'
  );
}

function getPrismaClient(): PrismaClient {
  const existing = global.prisma;
  if (existing && isPrismaClientCurrent(existing)) {
    return existing;
  }

  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }

  return createPrismaClient();
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
