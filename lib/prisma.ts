// lib/prisma.ts
import { Prisma, PrismaClient } from '@prisma/client';
import {
  getSlowPrismaQueryThresholdMs,
  logSlowPrismaQuery,
  shouldLogSlowPrismaQueries,
} from '@/lib/performance';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // Prefer event-based query logs so we can filter slow queries and avoid
  // printing bound parameter values (emails, phones, tokens).
  const enableSlowQueryEvents = shouldLogSlowPrismaQueries();

  const log: Prisma.LogDefinition[] = [
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ];

  if (enableSlowQueryEvents) {
    log.push({ emit: 'event', level: 'query' });
  }

  const client = new PrismaClient({ log });

  if (enableSlowQueryEvents) {
    const thresholdMs = getSlowPrismaQueryThresholdMs();
    client.$on('query', (event: Prisma.QueryEvent) => {
      if (event.duration >= thresholdMs) {
        // Intentionally omit `event.params` — may contain PII/secrets.
        logSlowPrismaQuery(event.duration, event.query);
      }
    });
  }

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

/**
 * Server-only Prisma singleton. Guard against accidental client bundles so
 * importing this file in the browser does not construct PrismaClient.
 */
export const prisma =
  typeof window === 'undefined'
    ? getPrismaClient()
    : (null as unknown as PrismaClient);

if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
