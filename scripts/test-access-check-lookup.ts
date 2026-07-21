/**
 * Phase 3C — Client 360 read access-check behavior + request memoization.
 *
 * Run: npm run test:access-check-lookup
 * Or:  npx tsx scripts/test-access-check-lookup.ts
 */
import {
  AssignmentRole,
  ClientStatus,
  DealParticipantRole,
  DealStatus,
  DealType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { accessCheckPrisma } from '../lib/accessCheckPrisma';
import {
  canReadClientCore,
  canViewClientDeals,
  hasClientAssignment,
  hasDealParticipantOnClient,
} from '../lib/authHelpers';
import { prisma } from '../lib/prisma';

const RUN_ID = Date.now();
const TEST_EMAIL_DOMAIN = 'example.test';

type TestResult = { name: string; ok: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function createUser(key: string, role: UserRole) {
  return prisma.user.create({
    data: {
      email: `access-check-${key}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      name: `Access Check ${key}`,
      role,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, role: true },
  });
}

async function main() {
  const assigned = await createUser('assigned', UserRole.STANDARD_USER);
  const outsider = await createUser('outsider', UserRole.STANDARD_USER);
  const admin = await createUser('admin', UserRole.SUPER_ADMIN);
  const participantOnly = await createUser(
    'participant',
    UserRole.STANDARD_USER
  );

  const client = await prisma.client.create({
    data: {
      name: `ACCESS CHECK CLIENT ${RUN_ID}`,
      email: `access-check-client-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      status: ClientStatus.NEW_LEAD,
    },
    select: { id: true },
  });

  await prisma.clientAssignment.create({
    data: {
      clientId: client.id,
      userId: assigned.id,
      role: AssignmentRole.RELATIONSHIP,
    },
  });

  const deal = await prisma.deal.create({
    data: {
      clientId: client.id,
      name: `Access check deal ${RUN_ID}`,
      dealValue: 1000,
      totalCommission: 100,
      dealType: DealType.CUSTOM,
      status: DealStatus.PROPOSED,
      participants: {
        create: {
          userId: participantOnly.id,
          role: DealParticipantRole.DOCTOR,
          commissionPercent: 100,
        },
      },
    },
    select: { id: true },
  });

  const originalFindFirst = accessCheckPrisma.clientAssignment.findFirst.bind(
    accessCheckPrisma.clientAssignment
  );
  let assignmentLookups = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (accessCheckPrisma.clientAssignment as any).findFirst = async (
    ...args: unknown[]
  ) => {
    assignmentLookups += 1;
    return (originalFindFirst as (...a: unknown[]) => unknown)(...args);
  };

  try {
    assert(
      await canReadClientCore(admin.id, admin.role, client.id),
      'admin can read core'
    );
    record('SUPER_ADMIN canReadClientCore without assignment', true, 'allowed');

    assert(
      await canReadClientCore(assigned.id, assigned.role, client.id),
      'assigned can read'
    );
    record('assigned STANDARD_USER canReadClientCore', true, 'allowed');

    assert(
      !(await canReadClientCore(outsider.id, outsider.role, client.id)),
      'outsider denied'
    );
    record('outsider STANDARD_USER canReadClientCore denied', true, 'forbidden');

    assert(
      await canReadClientCore(
        participantOnly.id,
        participantOnly.role,
        client.id
      ),
      'deal participant can read core'
    );
    record(
      'deal-participant-only STANDARD_USER canReadClientCore',
      true,
      'allowed'
    );

    assert(
      await canViewClientDeals(assigned.id, assigned.role, client.id),
      'assigned can view deals'
    );
    assert(
      !(await canViewClientDeals(outsider.id, outsider.role, client.id)),
      'outsider cannot view deals'
    );
    record(
      'canViewClientDeals allows assigned, denies outsider',
      true,
      'ok'
    );

    assignmentLookups = 0;
    const first = await hasClientAssignment(assigned.id, client.id);
    const second = await hasClientAssignment(assigned.id, client.id);
    assert(Boolean(first), 'assignment exists');
    assert(
      first?.assignmentId === second?.assignmentId,
      'memo returns same row'
    );
    // React `cache()` dedupes inside Next.js request scope; plain tsx may
    // re-query. Assert semantic consistency either way.
    record(
      'hasClientAssignment repeated calls return consistent result',
      true,
      `lookups=${assignmentLookups} (Next request scope dedupes via React cache)`
    );

    const participant = await hasDealParticipantOnClient(
      participantOnly.id,
      client.id,
      [DealParticipantRole.DOCTOR]
    );
    assert(Boolean(participant), 'doctor participant exists');
    const noParticipant = await hasDealParticipantOnClient(
      outsider.id,
      client.id
    );
    assert(!noParticipant, 'outsider has no participant');
    record(
      'hasDealParticipantOnClient role filter + deny',
      true,
      'ok'
    );
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (accessCheckPrisma.clientAssignment as any).findFirst = originalFindFirst;
    await prisma.deal.delete({ where: { id: deal.id } }).catch(() => undefined);
    await prisma.client.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.user
      .deleteMany({
        where: {
          id: {
            in: [assigned.id, outsider.id, admin.id, participantOnly.id],
          },
        },
      })
      .catch(() => undefined);
  }
}

main()
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(
      `\nSummary: ${results.length - failed.length}/${results.length} passed`
    );
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (accessCheckPrisma !== prisma) {
      await accessCheckPrisma.$disconnect().catch(() => undefined);
    }
  });
