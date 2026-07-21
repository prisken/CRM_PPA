/**
 * Interactive write transactions via DIRECT_URL when available.
 *
 * Supabase pooler in transaction mode (port 6543) cannot run Prisma
 * `$transaction(async (tx) => …)` callbacks. Local dev may still work when
 * DATABASE_URL uses session pooler or direct Postgres. Production mutations
 * that need multi-step atomicity should use `runWriteTransaction`.
 *
 * Opt-out: `PRISMA_WRITE_TRANSACTION_DIRECT=false` forces pooler `prisma`.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

declare global {
  var prismaWrite: PrismaClient | undefined;
}

function shouldUseDirectWriteTransaction(): boolean {
  if (process.env.PRISMA_WRITE_TRANSACTION_DIRECT === 'false') {
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

function createWritePrisma(): PrismaClient {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (!directUrl || !shouldUseDirectWriteTransaction()) {
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

function getWritePrisma(): PrismaClient {
  if (typeof window !== 'undefined') {
    return prisma;
  }

  if (!global.prismaWrite) {
    global.prismaWrite = createWritePrisma();
  }
  return global.prismaWrite;
}

export function getWriteTransactionTransport(): 'direct' | 'pooler' {
  if (
    shouldUseDirectWriteTransaction() &&
    process.env.DIRECT_URL?.trim() &&
    getWritePrisma() !== prisma
  ) {
    return 'direct';
  }
  return 'pooler';
}

/** Run an interactive Prisma transaction on the write client (direct when set). */
export async function runWriteTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return getWritePrisma().$transaction(fn);
}
