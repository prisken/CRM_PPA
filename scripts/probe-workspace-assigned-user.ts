/**
 * Phase 3B — probe workspace as an assigned STANDARD_USER (not SUPER_ADMIN).
 * Run: npx tsx scripts/probe-workspace-assigned-user.ts
 */
import { AssignmentRole, UserRole, UserStatus } from '@prisma/client';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

const BASE_URL =
  process.env.BASE_URL?.trim() ||
  process.env.TEST_BASE_URL?.trim() ||
  'http://localhost:3001';

async function main() {
  const assignment = await prisma.clientAssignment.findFirst({
    where: {
      role: AssignmentRole.RELATIONSHIP,
      user: { role: UserRole.STANDARD_USER, status: UserStatus.ACTIVE },
      client: { status: { not: 'ARCHIVED' } },
    },
    select: {
      clientId: true,
      user: { select: { id: true, email: true, role: true, name: true } },
    },
  });

  if (!assignment) {
    console.log(JSON.stringify({ assignedProbe: 'none' }));
    return;
  }

  const token = await signAuthToken({
    id: assignment.user.id,
    email: assignment.user.email,
    role: assignment.user.role,
    name: assignment.user.name,
  });

  const url = `${BASE_URL}/api/clients/${assignment.clientId}/workspace?tab=strategy-tasks`;

  await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const t0 = performance.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const elapsed = Math.round(performance.now() - t0);
  const body = await res.text();

  console.log(
    JSON.stringify({
      assignedProbe: true,
      status: res.status,
      clientMs: elapsed,
      bytes: Buffer.byteLength(body),
      clientIdPrefix: assignment.clientId.slice(0, 8),
      userIdPrefix: assignment.user.id.slice(0, 8),
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
