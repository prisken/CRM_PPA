/**
 * Phase 4C — measurement-only: pooler vs DIRECT_URL wall times for the three
 * workspace strategy-tasks domain legs. Does **not** change product transport.
 *
 * Also estimates hybrid parallel wall:
 *   max(directScalar, poolerTasks, directLegacy)
 * vs all-pooler:
 *   max(poolerScalar, poolerTasks, poolerLegacy)
 *
 * Run: npx tsx scripts/measure-workspace-domain-direct-risk.ts
 * Optional: CLIENT_ID=cmqv35szi0000jp04jaejps9j
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

const CLIENT_ID =
  process.env.CLIENT_ID?.trim() || 'cmqv35szi0000jp04jaejps9j';
const ROUNDS = Number(process.env.ROUNDS?.trim() || '5');

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.TaskSelect;

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

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0
    ? Math.round((s[mid - 1]! + s[mid]!) / 2)
    : s[mid]!;
}

async function timeLeg(
  fn: () => Promise<unknown>
): Promise<number> {
  const t0 = performance.now();
  await fn();
  return Math.round(performance.now() - t0);
}

async function benchTransport(
  label: 'pooler' | 'direct',
  client: PrismaClient,
  clientId: string
) {
  // warm each leg once
  await client.client.findUnique({
    where: { id: clientId },
    select: { id: true, strategyText: true },
  });
  await client.task.findMany({
    where: { clientId },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    select: taskSelect,
  });
  await client.strategy.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: { description: true, updatedAt: true },
  });

  const scalarMs: number[] = [];
  const tasksMs: number[] = [];
  const legacyMs: number[] = [];
  const parallelAllMs: number[] = [];
  const pingMs: number[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    pingMs.push(await timeLeg(() => client.$queryRaw`SELECT 1`));

    scalarMs.push(
      await timeLeg(() =>
        client.client.findUnique({
          where: { id: clientId },
          select: { id: true, strategyText: true },
        })
      )
    );
    tasksMs.push(
      await timeLeg(() =>
        client.task.findMany({
          where: { clientId },
          orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
          select: taskSelect,
        })
      )
    );
    legacyMs.push(
      await timeLeg(() =>
        client.strategy.findMany({
          where: { clientId },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { description: true, updatedAt: true },
        })
      )
    );

    // True parallel wall on this client (same as production Promise.all).
    // Note: connection_limit=1 serializes direct parallel — measured separately.
    const t0 = performance.now();
    await Promise.all([
      client.client.findUnique({
        where: { id: clientId },
        select: { id: true, strategyText: true },
      }),
      client.task.findMany({
        where: { clientId },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        select: taskSelect,
      }),
      client.strategy.findMany({
        where: { clientId },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { description: true, updatedAt: true },
      }),
    ]);
    parallelAllMs.push(Math.round(performance.now() - t0));
  }

  return {
    label,
    pingAvg: avg(pingMs),
    pingMedian: median(pingMs),
    scalar: { samples: scalarMs, avg: avg(scalarMs), median: median(scalarMs) },
    tasks: { samples: tasksMs, avg: avg(tasksMs), median: median(tasksMs) },
    legacy: { samples: legacyMs, avg: avg(legacyMs), median: median(legacyMs) },
    parallelAll: {
      samples: parallelAllMs,
      avg: avg(parallelAllMs),
      median: median(parallelAllMs),
    },
    theoreticalSerialSumAvg:
      avg(scalarMs) + avg(tasksMs) + avg(legacyMs),
    theoreticalMaxOfLegsAvg: Math.max(
      avg(scalarMs),
      avg(tasksMs),
      avg(legacyMs)
    ),
  };
}

async function main() {
  const clientId = CLIENT_ID;
  const exists = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, strategyText: true },
  });
  if (!exists) {
    console.log(JSON.stringify({ error: 'client not found', clientId }));
    return;
  }

  const taskCount = await prisma.task.count({ where: { clientId } });

  console.log(
    JSON.stringify({
      phase: '4C',
      clientIdPrefix: clientId.slice(0, 8),
      strategyChars: (exists.strategyText ?? '').trim().length,
      taskCount,
      rounds: ROUNDS,
      note: 'Product domain transport unchanged — measurement only',
    })
  );

  const pooler = await benchTransport('pooler', prisma, clientId);

  const directUrl = process.env.DIRECT_URL?.trim();
  let direct: Awaited<ReturnType<typeof benchTransport>> | null = null;
  let directParallelLimit1: number[] | null = null;

  if (directUrl) {
    const directClient = new PrismaClient({
      datasources: {
        db: { url: withConnectionLimit(directUrl, 1) },
      },
    });
    try {
      direct = await benchTransport('direct', directClient, clientId);
      // Explicit: Promise.all on connection_limit=1 tends to serialize.
      directParallelLimit1 = [];
      for (let i = 0; i < ROUNDS; i++) {
        const t0 = performance.now();
        await Promise.all([
          directClient.client.findUnique({
            where: { id: clientId },
            select: { id: true, strategyText: true },
          }),
          directClient.strategy.findMany({
            where: { clientId },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { description: true, updatedAt: true },
          }),
        ]);
        directParallelLimit1.push(Math.round(performance.now() - t0));
      }
    } finally {
      await directClient.$disconnect();
    }
  } else {
    console.log(JSON.stringify({ warning: 'DIRECT_URL unset — pooler only' }));
  }

  console.log(JSON.stringify({ pooler }, null, 2));
  if (direct) {
    console.log(JSON.stringify({ direct }, null, 2));
  }

  // Hybrid estimate: direct tiny legs + pooler tasks (true parallel across transports).
  if (direct) {
    const hybridWallAvg = Math.max(
      direct.scalar.avg,
      pooler.tasks.avg,
      direct.legacy.avg
    );
    const hybridWallMedian = Math.max(
      direct.scalar.median,
      pooler.tasks.median,
      direct.legacy.median
    );
    const allPoolerWallAvg = Math.max(
      pooler.scalar.avg,
      pooler.tasks.avg,
      pooler.legacy.avg
    );
    const savingsAvg = allPoolerWallAvg - hybridWallAvg;

    const connectionBudget = {
      existingDirectClients: [
        'authUserPrisma connection_limit=1',
        'accessCheckPrisma connection_limit=1',
      ],
      currentReservedDirectSlots: 2,
      hybridWouldAdd: 'domainTinyPrisma connection_limit=1 (or 2 if scalar∥legacy concurrent)',
      peakReservedIfHybrid: '3–4 direct slots per Node process',
      risk:
        'Supabase direct connection caps are much lower than pooler; multi-instance multiplies reserved slots; connection_limit=1 serializes concurrent direct domain legs',
    };

    console.log(
      JSON.stringify(
        {
          hybridEstimate: {
            description:
              'direct Client scalar + direct Legacy Strategy + pooler Tasks (parallel)',
            allPoolerWallAvg,
            hybridWallAvg,
            hybridWallMedian,
            estimatedSavingsMs: savingsAvg,
            bottleneck:
              pooler.tasks.avg >= Math.max(direct.scalar.avg, direct.legacy.avg)
                ? 'pooler_tasks_still_dominates'
                : 'direct_or_other_leg_dominates',
            directScalarLegacyParallelOnLimit1Avg: directParallelLimit1
              ? avg(directParallelLimit1)
              : null,
            recommendation:
              savingsAvg < 40 ||
              pooler.tasks.avg >= Math.max(direct.scalar.avg, direct.legacy.avg)
                ? 'DO_NOT_MIGRATE — hybrid unlikely to beat parallelBase while tasks stay on pooler'
                : 'RECONSIDER_ONLY_WITH_CONNECTION_BUDGET',
          },
          connectionBudget,
          classification: {
            clientScalar: {
              directCandidate: 'maybe',
              why: 'tiny PK read; sub-ms in Postgres',
            },
            legacyStrategy: {
              directCandidate: 'maybe',
              why: 'tiny take-1 fallback; legacy path only semantically',
            },
            tasksAssignee: {
              directCandidate: 'no_by_default',
              why: 'list/domain payload + assignee join; variable cardinality',
            },
          },
        },
        null,
        2
      )
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
