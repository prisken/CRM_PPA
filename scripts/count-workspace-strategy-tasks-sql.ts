import { PrismaClient } from '@prisma/client';
import { client360StrategyTasksSelect } from '../lib/client360';

const CLIENT_ID = 'cmqv35szi0000jp04jaejps9j';
const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
});

type QueryEvent = { duration: number; query: string };
const queries: QueryEvent[] = [];

prisma.$on('query', (e) => {
  queries.push({
    duration: e.duration,
    query: e.query.replace(/\s+/g, ' ').slice(0, 160),
  });
});

async function main() {
  await prisma.client.findUnique({
    where: { id: CLIENT_ID },
    select: { id: true },
  });
  queries.length = 0;

  const t0 = performance.now();
  await prisma.client.findUnique({
    where: { id: CLIENT_ID },
    select: client360StrategyTasksSelect,
  });
  console.log(
    JSON.stringify(
      {
        wallMs: Math.round(performance.now() - t0),
        queryCount: queries.length,
        queries,
      },
      null,
      2
    )
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
