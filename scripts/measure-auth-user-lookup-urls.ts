/**
 * Phase 3B — compare User PK lookup via DATABASE_URL (pooler) vs DIRECT_URL.
 * Run: npx tsx scripts/measure-auth-user-lookup-urls.ts
 */
import { PrismaClient } from '@prisma/client';

async function bench(label: string, url: string | undefined) {
  if (!url) {
    console.log(JSON.stringify({ label, error: 'missing url' }));
    return;
  }

  const client = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const user = await client.user.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    if (!user) {
      console.log(JSON.stringify({ label, error: 'no ACTIVE user' }));
      return;
    }

    await client.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, status: true },
    });

    const ms: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await client.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          role: true,
          name: true,
          email: true,
          status: true,
        },
      });
      ms.push(Math.round(performance.now() - t0));
    }

    const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
    console.log(JSON.stringify({ label, ms, avg }));
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  await bench('DATABASE_URL(pooler)', process.env.DATABASE_URL);
  await bench('DIRECT_URL', process.env.DIRECT_URL);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
