/**
 * Integration test for deal participant create → read → WON → returnables flow.
 *
 * Run: npm run test:deal-participant-api
 *
 * LIMITATION: Deal API routes (`/api/clients/[id]/deals`) authenticate via Supabase
 * session cookies (`getAuthenticatedUser`), not Bearer JWT. This script exercises the
 * same Prisma + library path used by those route handlers. An optional HTTP probe
 * (`TEST_DEAL_API_HTTP=1` with `npm run dev` running) documents the auth gap.
 */
import {
  AssignmentRole,
  DealParticipantRole,
  DealStatus,
  DealType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { createCommissionReturnablesForWonDeal } from '../lib/commissionReturnables';
import {
  dealResponseSelect,
  formatDealResponse,
} from '../lib/dealCalculations';
import {
  resolveExplicitDealParticipants,
  toParticipantCreateInput,
} from '../lib/dealParticipants';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

const RUN_ID = Date.now();
const TEST_EMAIL_DOMAIN = 'example.test';
const TOTAL_COMMISSION = 10000;

type TestUserKey = 'relationship' | 'follow-up' | 'doctor-a' | 'doctor-b';

type CreatedResources = {
  userIds: string[];
  clientId: string | null;
  dealId: string | null;
};

const created: CreatedResources = {
  userIds: [],
  clientId: null,
  dealId: null,
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, message: string) {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function testUserEmail(key: TestUserKey) {
  return `deal-participant-api-test-${key}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`;
}

async function findOrCreateTestUser(key: TestUserKey, displayName: string) {
  const email = testUserEmail(key);
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (existing) {
    return existing;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: displayName,
      role: UserRole.STANDARD_USER,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true, name: true },
  });

  created.userIds.push(user.id);
  return user;
}

async function createDealViaLibraries({
  clientId,
  relationshipUserId,
  followUpUserId,
  doctorAUserId,
  doctorBUserId,
}: {
  clientId: string;
  relationshipUserId: string;
  followUpUserId: string;
  doctorAUserId: string;
  doctorBUserId: string;
}) {
  const rawParticipants = [
    {
      role: DealParticipantRole.RELATIONSHIP,
      userId: relationshipUserId,
      commissionPercent: 10,
    },
    {
      role: DealParticipantRole.FOLLOW_UP,
      userId: followUpUserId,
      commissionPercent: 10,
    },
    {
      role: DealParticipantRole.COMPANY,
      externalName: 'Profit Pulse Ally',
      commissionPercent: 20,
    },
    {
      role: DealParticipantRole.DOCTOR,
      userId: doctorAUserId,
      commissionPercent: 30,
      isReturnableRequired: true,
      returnablePercent: 20,
    },
    {
      role: DealParticipantRole.DOCTOR,
      userId: doctorBUserId,
      commissionPercent: 30,
      isReturnableRequired: true,
      returnablePercent: 20,
    },
  ];

  const participantsResult = resolveExplicitDealParticipants({
    rawParticipants,
    totalCommission: TOTAL_COMMISSION,
    status: DealStatus.PROPOSED,
  });

  if ('error' in participantsResult) {
    throw new Error(
      `Participant validation failed: ${participantsResult.error} ${(participantsResult.details ?? []).join(' ')}`
    );
  }

  const deal = await prisma.deal.create({
    data: {
      clientId,
      name: `Deal Participant API Test ${RUN_ID}`,
      dealValue: 50000,
      totalCommission: TOTAL_COMMISSION,
      dealType: DealType.INVESTMENT,
      status: DealStatus.PROPOSED,
      participants: {
        create: toParticipantCreateInput(participantsResult.participants),
      },
    },
    select: dealResponseSelect,
  });

  return formatDealResponse(deal);
}

async function getDealsViaLibraries(clientId: string) {
  const deals = await prisma.deal.findMany({
    where: { clientId },
    orderBy: { createdAt: 'asc' },
    select: dealResponseSelect,
  });

  return deals.map(formatDealResponse);
}

async function markDealWonViaLibraries(dealId: string, clientId: string) {
  const updatedDeal = await prisma.deal.update({
    where: { id: dealId },
    data: { status: DealStatus.WON },
    select: dealResponseSelect,
  });

  await createCommissionReturnablesForWonDeal({
    dealId,
    clientId,
    totalCommission: Number(updatedDeal.totalCommission),
  });

  return formatDealResponse(updatedDeal);
}

async function probeHttpAuthLimitation(clientId: string) {
  if (process.env.TEST_DEAL_API_HTTP !== '1') {
    console.log(
      'SKIP HTTP probe (set TEST_DEAL_API_HTTP=1 and run dev server to verify Bearer auth limitation)'
    );
    return;
  }

  const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
  const superAdmin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
    select: { id: true, email: true, role: true, name: true },
  });

  if (!superAdmin) {
    console.log('SKIP HTTP probe: no super admin user found');
    return;
  }

  const token = await signAuthToken(superAdmin);
  const response = await fetch(`${baseUrl}/api/clients/${clientId}/deals`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  console.log(
    `HTTP probe GET /api/clients/${clientId}/deals → status ${response.status} ` +
      `(deal routes use session auth; Bearer-only typically returns 401)`
  );
}

async function cleanup() {
  if (created.clientId) {
    const dealIds = (
      await prisma.deal.findMany({
        where: { clientId: created.clientId },
        select: { id: true },
      })
    ).map((deal) => deal.id);

    if (dealIds.length > 0) {
      await prisma.commissionReturnable.deleteMany({
        where: { dealId: { in: dealIds } },
      });
      await prisma.deal.deleteMany({
        where: { id: { in: dealIds } },
      });
    }

    await prisma.clientAssignment.deleteMany({
      where: { clientId: created.clientId },
    });
    await prisma.client.deleteMany({
      where: { id: created.clientId },
    });
  } else if (created.dealId) {
    await prisma.commissionReturnable.deleteMany({
      where: { dealId: created.dealId },
    });
    await prisma.deal.deleteMany({
      where: { id: created.dealId },
    });
  }

  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: created.userIds } },
    });
  }
}

async function main() {
  console.log(`Deal participant API integration test @ ${new Date().toISOString()}`);
  console.log(`Run ID: ${RUN_ID}`);
  console.log(
    'Mode: Prisma + route libraries (see script header for HTTP auth limitation)\n'
  );

  try {
    const relationshipUser = await findOrCreateTestUser(
      'relationship',
      'Test Relationship Officer'
    );
    const followUpUser = await findOrCreateTestUser(
      'follow-up',
      'Test Follow-up Officer'
    );
    const doctorA = await findOrCreateTestUser('doctor-a', 'Test Doctor A');
    const doctorB = await findOrCreateTestUser('doctor-b', 'Test Doctor B');

    console.log('Users ready:');
    console.log(`  relationship: ${relationshipUser.email}`);
    console.log(`  follow-up:    ${followUpUser.email}`);
    console.log(`  doctor A:     ${doctorA.email}`);
    console.log(`  doctor B:     ${doctorB.email}\n`);

    const client = await prisma.client.create({
      data: {
        name: `Deal Participant API Test Client ${RUN_ID}`,
        email: `deal-participant-api-client-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      },
    });
    created.clientId = client.id;

    await prisma.clientAssignment.createMany({
      data: [
        {
          clientId: client.id,
          userId: relationshipUser.id,
          role: AssignmentRole.RELATIONSHIP,
        },
        {
          clientId: client.id,
          userId: followUpUser.id,
          role: AssignmentRole.ACCOUNT_SERVICE,
        },
      ],
    });

    console.log(`Created client ${client.id} with relationship/follow-up assignments\n`);

    const createdDeal = await createDealViaLibraries({
      clientId: client.id,
      relationshipUserId: relationshipUser.id,
      followUpUserId: followUpUser.id,
      doctorAUserId: doctorA.id,
      doctorBUserId: doctorB.id,
    });
    created.dealId = createdDeal.id;

    assert(createdDeal.participants.length === 5, 'POST create should persist 5 participants');
    assert(
      createdDeal.commissionModel === 'PARTICIPANT',
      `expected commissionModel PARTICIPANT, got ${createdDeal.commissionModel}`
    );
    assert(
      createdDeal.usesLegacyCommissionFallback === false,
      'usesLegacyCommissionFallback should be false for participant-backed deals'
    );

    const participantByRole = (role: DealParticipantRole) =>
      createdDeal.participants.filter((participant) => participant.role === role);

    assertClose(
      participantByRole(DealParticipantRole.RELATIONSHIP)[0]?.commissionPercent ?? -1,
      10,
      'Relationship percent'
    );
    assertClose(
      participantByRole(DealParticipantRole.FOLLOW_UP)[0]?.commissionPercent ?? -1,
      10,
      'Follow-up percent'
    );
    assertClose(
      participantByRole(DealParticipantRole.COMPANY)[0]?.commissionPercent ?? -1,
      20,
      'Company percent'
    );

    const doctors = participantByRole(DealParticipantRole.DOCTOR);
    assert(doctors.length === 2, 'Expected two doctor participants');
    assertClose(doctors[0]?.commissionPercent ?? -1, 30, 'Doctor A percent');
    assertClose(doctors[1]?.commissionPercent ?? -1, 30, 'Doctor B percent');
    assertClose(
      doctors[0]?.commissionAmount ?? -1,
      3000,
      'Doctor A commission amount'
    );
    assertClose(
      doctors[1]?.commissionAmount ?? -1,
      3000,
      'Doctor B commission amount'
    );

    console.log('PASS POST create investment deal with explicit participants');

    const legacyDealRecord = await prisma.deal.create({
      data: {
        clientId: client.id,
        name: `Legacy Fallback Deal ${RUN_ID}`,
        dealValue: 10000,
        totalCommission: 2000,
        dealType: DealType.CUSTOM,
        status: DealStatus.PROPOSED,
      },
      select: dealResponseSelect,
    });
    const legacyDeal = formatDealResponse(legacyDealRecord);
    assert(
      legacyDeal.commissionModel === 'LEGACY_FALLBACK',
      `expected LEGACY_FALLBACK, got ${legacyDeal.commissionModel}`
    );
    assert(
      legacyDeal.usesLegacyCommissionFallback === true,
      'usesLegacyCommissionFallback should be true when no participants'
    );
    console.log('PASS formatDealResponse marks empty-participant deals as LEGACY_FALLBACK');

    const deals = await getDealsViaLibraries(client.id);
    const fetchedDeal = deals.find((deal) => deal.id === createdDeal.id);

    if (!fetchedDeal) {
      throw new Error('GET deals should include created deal');
    }

    assert(
      fetchedDeal.participants.length === 5,
      'GET deals should return participant rows'
    );
    assert(
      fetchedDeal.participants.every((participant) => participant.id),
      'GET deals participants should include ids'
    );

    console.log('PASS GET deals returns participants');

    const wonDeal = await markDealWonViaLibraries(createdDeal.id, client.id);
    assert(wonDeal.status === DealStatus.WON, 'Deal should be WON after update');

    console.log('PASS Update deal to WON');

    const returnables = await prisma.commissionReturnable.findMany({
      where: { dealId: createdDeal.id },
      orderBy: { userId: 'asc' },
    });

    assert(returnables.length === 2, 'Returnables should exist for both doctors');

    const returnableByUserId = new Map(
      returnables.map((row) => [row.userId, Number(row.amount)])
    );

    assertClose(
      returnableByUserId.get(doctorA.id) ?? -1,
      600,
      'Doctor A returnable (20% of 3000)'
    );
    assertClose(
      returnableByUserId.get(doctorB.id) ?? -1,
      600,
      'Doctor B returnable (20% of 3000)'
    );

    console.log('PASS Returnables generated for doctor participants');

    await probeHttpAuthLimitation(client.id);

    console.log('\nPASS deal participant API integration test');
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error('FAIL deal participant API integration test:', error);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error('Cleanup failed:', cleanupError);
  }
  await prisma.$disconnect();
  process.exit(1);
});
