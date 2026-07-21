/**
 * Phase 3B — measure User PK lookup latency (full vs narrow select).
 * Run: npx tsx scripts/measure-auth-user-lookup.ts
 */
import { prisma } from '../lib/prisma';

async function main() {
  const user = await prisma.user.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  if (!user) {
    console.log('No ACTIVE user');
    return;
  }

  const id = user.id;

  // Warm connection
  await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });

  const samples = 5;
  const fullMs: number[] = [];
  const narrowMs: number[] = [];
  const pingMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    let t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    pingMs.push(Math.round(performance.now() - t0));

    t0 = performance.now();
    await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, name: true, email: true, status: true },
    });
    fullMs.push(Math.round(performance.now() - t0));

    t0 = performance.now();
    await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });
    narrowMs.push(Math.round(performance.now() - t0));
  }

  const explain = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id, role, name, email, status FROM "User" WHERE id = $1`,
    id
  );

  const avg = (xs: number[]) =>
    Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

  console.log(
    JSON.stringify(
      {
        userIdPrefix: id.slice(0, 8),
        samples,
        pingMs,
        pingAvg: avg(pingMs),
        fullSelectMs: fullMs,
        fullAvg: avg(fullMs),
        narrowSelectMs: narrowMs,
        narrowAvg: avg(narrowMs),
        explain,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
