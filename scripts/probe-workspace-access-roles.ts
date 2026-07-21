/**
 * Phase 3C — measure workspace access for SUPER_ADMIN vs assigned STANDARD_USER.
 * Run: BASE_URL=http://localhost:3001 npx tsx scripts/probe-workspace-access-roles.ts
 */
import { AssignmentRole, UserRole, UserStatus } from '@prisma/client';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

const BASE_URL =
  process.env.BASE_URL?.trim() ||
  process.env.TEST_BASE_URL?.trim() ||
  'http://localhost:3001';

async function tokenFor(user: {
  id: string;
  email: string;
  role: UserRole;
  name: string | null;
}) {
  return signAuthToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });
}

async function hitWorkspace(
  label: string,
  token: string,
  clientId: string
) {
  const url = `${BASE_URL}/api/clients/${clientId}/workspace?tab=strategy-tasks`;
  await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const t0 = performance.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const elapsed = Math.round(performance.now() - t0);
  const body = await res.text();
  console.log(
    JSON.stringify({
      label,
      status: res.status,
      clientMs: elapsed,
      bytes: Buffer.byteLength(body),
      clientIdPrefix: clientId.slice(0, 8),
    })
  );
}

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

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
    select: { id: true, email: true, role: true, name: true },
  });

  const outsider = await prisma.user.findFirst({
    where: {
      role: UserRole.STANDARD_USER,
      status: UserStatus.ACTIVE,
      ...(assignment
        ? { id: { not: assignment.user.id } }
        : {}),
      clientAssignments: assignment
        ? { none: { clientId: assignment.clientId } }
        : undefined,
    },
    select: { id: true, email: true, role: true, name: true },
  });

  if (!admin || !assignment) {
    console.log(
      JSON.stringify({
        error: 'need SUPER_ADMIN and assigned STANDARD_USER sample',
      })
    );
    return;
  }

  const clientId = assignment.clientId;
  await hitWorkspace('SUPER_ADMIN', await tokenFor(admin), clientId);
  await hitWorkspace(
    'STANDARD_USER_assigned',
    await tokenFor(assignment.user),
    clientId
  );
  if (outsider) {
    await hitWorkspace(
      'STANDARD_USER_denied',
      await tokenFor(outsider),
      clientId
    );
  } else {
    console.log(JSON.stringify({ label: 'STANDARD_USER_denied', skipped: true }));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
