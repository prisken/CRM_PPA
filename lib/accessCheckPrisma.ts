/**
 * Phase 3C — dedicated Prisma client for Client 360 **read** access-check
 * existence queries (assignment / deal-participant findFirst).
 *
 * Like Phase 3B auth User lookups, these checks execute in well under 1 ms in
 * Postgres but pay full Supabase pooler RTT (~230–300 ms) on the shared client.
 * Domain list/detail queries stay on pooler `prisma`.
 *
 * Enablement:
 * - Uses DIRECT_URL when set, unless `ACCESS_CHECK_LOOKUP_DIRECT=false`.
 * - Falls back to shared `prisma` when DIRECT_URL is unset or opted out.
 * - `connection_limit=1` (separate from auth User client).
 *
 * Not a cross-request permission cache — each request still hits the DB.
 * Request-scoped React `cache()` memoization remains in authHelpers.
 */
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

declare global {
  // eslint-disable-next-line no-var
  var accessCheckPrisma: PrismaClient | undefined;
}

function shouldUseDirectAccessCheckLookup(): boolean {
  if (process.env.ACCESS_CHECK_LOOKUP_DIRECT === 'false') {
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

function createAccessCheckPrisma(): PrismaClient {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (!directUrl || !shouldUseDirectAccessCheckLookup()) {
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

function getAccessCheckPrisma(): PrismaClient {
  if (typeof window !== 'undefined') {
    return prisma;
  }

  if (!global.accessCheckPrisma) {
    global.accessCheckPrisma = createAccessCheckPrisma();
  }
  return global.accessCheckPrisma;
}

/** Prisma client for read-route assignment/participant existence checks only. */
export const accessCheckPrisma = getAccessCheckPrisma();

export function getAccessCheckLookupTransport(): 'direct' | 'pooler' {
  if (
    shouldUseDirectAccessCheckLookup() &&
    process.env.DIRECT_URL?.trim() &&
    accessCheckPrisma !== prisma
  ) {
    return 'direct';
  }
  return 'pooler';
}
