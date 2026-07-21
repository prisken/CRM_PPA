/**
 * Phase 3B — dedicated Prisma client for authenticated User PK lookups.
 *
 * Client 360 read auth is dominated by pooler RTT (~230–300 ms) even though
 * Postgres executes `User` by primary key in ~1–2 ms. Measuring the same
 * findUnique via DIRECT_URL showed ~4× lower wall time locally.
 *
 * This client is **only** for `User` rows keyed by id (JWT subject / session
 * user id). Domain queries stay on the shared pooler `prisma` singleton.
 *
 * Enablement:
 * - Uses DIRECT_URL when set, unless `AUTH_USER_LOOKUP_DIRECT=false`.
 * - Falls back to shared `prisma` when DIRECT_URL is unset or opted out.
 * - `connection_limit=1` keeps the direct connection budget tiny.
 *
 * Not a cross-request auth/permission cache — each request still hits the DB.
 */
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

declare global {
  var authUserPrisma: PrismaClient | undefined;
}

function shouldUseDirectAuthLookup(): boolean {
  if (process.env.AUTH_USER_LOOKUP_DIRECT === 'false') {
    return false;
  }
  return Boolean(process.env.DIRECT_URL?.trim());
}

function withConnectionLimit(url: string, limit: number): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('connection_limit', String(limit));
    return parsed.toString();
  } catch {
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}connection_limit=${limit}`;
  }
}

function createAuthUserPrisma(): PrismaClient {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (!directUrl || !shouldUseDirectAuthLookup()) {
    return prisma;
  }

  return new PrismaClient({
    datasources: {
      db: { url: withConnectionLimit(directUrl, 1) },
    },
    log: [
      { emit: 'stdout', level: 'warn' },
      { emit: 'stdout', level: 'error' },
    ],
  });
}

function getAuthUserPrisma(): PrismaClient {
  if (typeof window !== 'undefined') {
    return prisma;
  }

  if (!global.authUserPrisma) {
    global.authUserPrisma = createAuthUserPrisma();
  }
  return global.authUserPrisma;
}

/** Prisma client used solely for auth User findUnique-by-id. */
export const authUserPrisma = getAuthUserPrisma();

export function getAuthUserLookupTransport(): 'direct' | 'pooler' {
  if (
    shouldUseDirectAuthLookup() &&
    process.env.DIRECT_URL?.trim() &&
    authUserPrisma !== prisma
  ) {
    return 'direct';
  }
  return 'pooler';
}
