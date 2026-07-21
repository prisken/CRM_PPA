/**
 * Phase 3C — measure ClientAssignment / DealParticipant existence checks
 * via pooler vs DIRECT_URL.
 *
 * Run: npx tsx scripts/measure-access-check-lookup.ts
 */
import { AssignmentRole, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

async function benchClient(
  label: string,
  client: PrismaClient,
  userId: string,
  clientId: string
) {
  // warm
  await client.clientAssignment.findFirst({
    where: { userId, clientId },
    select: { assignmentId: true },
  });

  const assignmentMs: number[] = [];
  const participantMs: number[] = [];
  const pingMs: number[] = [];

  for (let i = 0; i < 5; i++) {
    let t0 = performance.now();
    await client.$queryRaw`SELECT 1`;
    pingMs.push(Math.round(performance.now() - t0));

    t0 = performance.now();
    await client.clientAssignment.findFirst({
      where: { userId, clientId },
      select: { assignmentId: true, role: true },
    });
    assignmentMs.push(Math.round(performance.now() - t0));

    t0 = performance.now();
    await client.dealParticipant.findFirst({
      where: { userId, deal: { clientId } },
      select: { id: true },
    });
    participantMs.push(Math.round(performance.now() - t0));
  }

  const avg = (xs: number[]) =>
    Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

  const explainAssignment = await client.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT assignment_id, role FROM client_assignments
     WHERE client_id = $1 AND user_id = $2
     LIMIT 1`,
    clientId,
    userId
  );

  console.log(
    JSON.stringify(
      {
        label,
        pingAvg: avg(pingMs),
        assignmentMs,
        assignmentAvg: avg(assignmentMs),
        participantMs,
        participantAvg: avg(participantMs),
        explainAssignment,
      },
      null,
      2
    )
  );
}

async function main() {
  const assignment = await prisma.clientAssignment.findFirst({
    where: {
      role: AssignmentRole.RELATIONSHIP,
      user: { role: UserRole.STANDARD_USER, status: UserStatus.ACTIVE },
    },
    select: { userId: true, clientId: true },
  });

  if (!assignment) {
    console.log(JSON.stringify({ error: 'no assigned STANDARD_USER sample' }));
    return;
  }

  const { userId, clientId } = assignment;
  console.log(
    JSON.stringify({
      sample: {
        userIdPrefix: userId.slice(0, 8),
        clientIdPrefix: clientId.slice(0, 8),
      },
    })
  );

  await benchClient('DATABASE_URL(pooler)', prisma, userId, clientId);

  const directUrl = process.env.DIRECT_URL?.trim();
  if (!directUrl) {
    console.log(JSON.stringify({ label: 'DIRECT_URL', error: 'missing' }));
    return;
  }

  const direct = new PrismaClient({
    datasources: { db: { url: `${directUrl}${directUrl.includes('?') ? '&' : '?'}connection_limit=1` } },
  });
  try {
    await benchClient('DIRECT_URL', direct, userId, clientId);
  } finally {
    await direct.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
