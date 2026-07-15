// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: ['query'], // Log queries to the console for debugging
  });

  // Warm the query engine so the first SSR request after recreate
  // does not hit "Engine is not yet connected".
  void client.$connect().catch(() => undefined);

  return client;
}

/**
 * After `prisma generate` / schema model additions, Next.js HMR can keep a
 * stale `global.prisma` singleton missing new delegates (e.g. clientContact).
 * Recreate when expected delegates are absent so Client 360 keeps working.
 *
 * Do NOT call `$disconnect()` on the previous singleton during HMR — Turbopack
 * may still hold that instance in another chunk and race with in-flight SSR.
 */
function isPrismaClientCurrent(client: PrismaClient): boolean {
  return (
    typeof client.client?.findUnique === 'function' &&
    typeof client.clientImportantDate?.findMany === 'function' &&
    typeof client.clientContact?.findMany === 'function' &&
    typeof client.clientStrategyPlan?.findMany === 'function' &&
    typeof client.dealParticipant?.findMany === 'function'
  );
}

function getPrismaClient(): PrismaClient {
  const existing = global.prisma;
  if (existing && isPrismaClientCurrent(existing)) {
    return existing;
  }

  return createPrismaClient();
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
