/**
 * Phase 3D — measure workspace strategy-tasks domain query shapes.
 * Run: npx tsx scripts/measure-workspace-strategy-tasks-query.ts
 */
import { client360StrategyTasksSelect } from '../lib/client360';
import { prisma } from '../lib/prisma';

const CLIENT_ID =
  process.env.PROFILE_CLIENT_ID?.trim() || 'cmqv35szi0000jp04jaejps9j';

async function main() {
  await prisma.client.findUnique({
    where: { id: CLIENT_ID },
    select: { id: true },
  });

  const walls: number[] = [];
  let sample: {
    strategyTextChars: number;
    strategiesCount: number;
    tasksCount: number;
  } | null = null;

  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const row = await prisma.client.findUnique({
      where: { id: CLIENT_ID },
      select: client360StrategyTasksSelect,
    });
    walls.push(Math.round(performance.now() - t0));
    if (i === 0 && row) {
      sample = {
        strategyTextChars: (row.strategyText ?? '').length,
        strategiesCount: row.strategies.length,
        tasksCount: row.tasks.length,
      };
    }
  }

  let t0 = performance.now();
  const scalar = await prisma.client.findUnique({
    where: { id: CLIENT_ID },
    select: { id: true, strategyText: true },
  });
  const scalarMs = Math.round(performance.now() - t0);

  t0 = performance.now();
  await prisma.task.findMany({
    where: { clientId: CLIENT_ID },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  const tasksMs = Math.round(performance.now() - t0);

  t0 = performance.now();
  await prisma.strategy.findMany({
    where: { clientId: CLIENT_ID },
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: { description: true, updatedAt: true },
  });
  const strategiesMs = Math.round(performance.now() - t0);

  t0 = performance.now();
  const [clientRow, tasks] = await Promise.all([
    prisma.client.findUnique({
      where: { id: CLIENT_ID },
      select: { id: true, strategyText: true },
    }),
    prisma.task.findMany({
      where: { clientId: CLIENT_ID },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);
  let strategies: { description: string; updatedAt: Date }[] = [];
  const needsLegacy = !(clientRow?.strategyText ?? '').trim();
  if (needsLegacy) {
    strategies = await prisma.strategy.findMany({
      where: { clientId: CLIENT_ID },
      orderBy: { updatedAt: 'desc' },
      take: 1,
      select: { description: true, updatedAt: true },
    });
  }
  const parallelSkipLegacyMs = Math.round(performance.now() - t0);

  const explainClient = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT id, strategy_text FROM "Client" WHERE id = $1`,
    CLIENT_ID
  );
  const explainTasks = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT id FROM tasks WHERE client_id = $1`,
    CLIENT_ID
  );
  const explainStrategies = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT description, "updatedAt" FROM "Strategy"
     WHERE client_id = $1
     ORDER BY "updatedAt" DESC
     LIMIT 1`,
    CLIENT_ID
  );

  console.log(
    JSON.stringify(
      {
        sample,
        combinedWallMs: walls,
        scalarMs,
        tasksMs,
        strategiesMs,
        parallelSkipLegacyMs,
        needsLegacy,
        strategiesFetched: strategies.length,
        explainClient,
        explainTasks,
        explainStrategies,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
