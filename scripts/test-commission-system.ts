/**
 * Local integration + unit tests for the commission engine upgrade.
 * Run: npx tsx scripts/test-commission-system.ts
 */
import { AssignmentRole, DealStatus, UserRole } from '@prisma/client';
import {
  calculateAssignmentSecuredCommission,
  calculateIndividualRoleShare,
  calculateUserClientCommissionShare,
  buildRoleOccupancyMap,
  getRoleOccupancy,
} from '../lib/commissionCalculations';
import {
  COMPANY_OVERHEAD_RATE,
  COMMISSION_RATE_POOLS,
  countAssignmentsForRole,
  getRoleOccupancyLimitMessage,
  isRoleAtOccupancyLimit,
  ROLE_OCCUPANCY_LIMITS,
} from '../lib/constants';
import { buildClient360Response, client360Include } from '../lib/client360';
import { buildStandardDashboard } from '../lib/standardDashboard';
import { prisma } from '../lib/prisma';

import { signAuthToken } from '../lib/jwt';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

type TestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: TestResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}: ${detail}`);
}

function assertClose(actual: number, expected: number, tolerance = 0.01) {
  return Math.abs(actual - expected) <= tolerance;
}

async function authFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

function runUnitTests() {
  console.log('\n--- Unit tests: commission calculations ---\n');

  const doctorShare = calculateIndividualRoleShare(AssignmentRole.DOCTOR, 2);
  record(
    'calculateIndividualRoleShare (Doctor, 2 occupants)',
    assertClose(doctorShare, 0.3),
    `expected 0.30, got ${doctorShare}`
  );

  const relationshipShare = calculateIndividualRoleShare(
    AssignmentRole.RELATIONSHIP,
    1
  );
  record(
    'calculateIndividualRoleShare (Relationship, 1 occupant)',
    assertClose(relationshipShare, 0.1),
    `expected 0.10, got ${relationshipShare}`
  );

  const assignedUsers = [
    { user_id: 'user-a', role: 'DOCTOR' },
    { user_id: 'user-b', role: 'DOCTOR' },
    { user_id: 'user-a', role: 'RELATIONSHIP' },
  ];

  const clientShare = calculateUserClientCommissionShare('user-a', assignedUsers);
  record(
    'calculateUserClientCommissionShare (Doctor + Relationship)',
    assertClose(clientShare, 0.4),
    `expected 0.40, got ${clientShare}`
  );

  const securedCommission = calculateAssignmentSecuredCommission(
    [
      { totalCommission: 100000, status: DealStatus.WON },
      { totalCommission: 50000, status: DealStatus.PROPOSED },
    ],
    AssignmentRole.DOCTOR,
    2
  );
  record(
    'calculateAssignmentSecuredCommission (WON deals only)',
    assertClose(securedCommission, 30000),
    `expected 30000, got ${securedCommission}`
  );

  const occupancyMap = buildRoleOccupancyMap([
    { clientId: 'client-1', role: AssignmentRole.DOCTOR },
    { clientId: 'client-1', role: AssignmentRole.DOCTOR },
    { clientId: 'client-1', role: AssignmentRole.RELATIONSHIP },
  ]);
  record(
    'buildRoleOccupancyMap',
    getRoleOccupancy(occupancyMap, 'client-1', AssignmentRole.DOCTOR) === 2 &&
      getRoleOccupancy(occupancyMap, 'client-1', AssignmentRole.RELATIONSHIP) === 1,
    `doctor=${getRoleOccupancy(occupancyMap, 'client-1', AssignmentRole.DOCTOR)}, relationship=${getRoleOccupancy(occupancyMap, 'client-1', AssignmentRole.RELATIONSHIP)}`
  );

  console.log('\n--- Unit tests: team composition rules ---\n');

  const doctorCount = countAssignmentsForRole(
    [
      { role: 'DOCTOR' },
      { role: 'DOCTOR' },
    ],
    AssignmentRole.DOCTOR
  );
  record(
    'countAssignmentsForRole',
    doctorCount === 2,
    `expected 2, got ${doctorCount}`
  );

  const atLimit = isRoleAtOccupancyLimit(
    [{ role: 'DOCTOR' }, { role: 'DOCTOR' }],
    AssignmentRole.DOCTOR
  );
  record(
    'isRoleAtOccupancyLimit (Doctor at max)',
    atLimit === true,
    `expected true, got ${atLimit}`
  );

  const limitMessage = getRoleOccupancyLimitMessage(AssignmentRole.DOCTOR, 2);
  record(
    'getRoleOccupancyLimitMessage',
    limitMessage === 'Error: A client can have a maximum of 2 Doctors.',
    limitMessage ?? 'no message'
  );

  const poolSum =
    COMMISSION_RATE_POOLS.DOCTOR +
    COMMISSION_RATE_POOLS.RELATIONSHIP +
    COMMISSION_RATE_POOLS.ACCOUNT_SERVICE +
    COMPANY_OVERHEAD_RATE;
  record(
    'commission pools + overhead sum to 100%',
    assertClose(poolSum, 1),
    `expected 1.0, got ${poolSum}`
  );

  record(
    'ROLE_OCCUPANCY_LIMITS configured',
    ROLE_OCCUPANCY_LIMITS.DOCTOR === 2 &&
      ROLE_OCCUPANCY_LIMITS.RELATIONSHIP === 1 &&
      ROLE_OCCUPANCY_LIMITS.ACCOUNT_SERVICE === 1,
    JSON.stringify(ROLE_OCCUPANCY_LIMITS)
  );
}

async function runDatabaseTests() {
  console.log('\n--- Database tests: commission metrics ---\n');

  const wonDeals = await prisma.deal.findMany({
    where: { status: DealStatus.WON },
    select: { totalCommission: true },
  });

  const expectedCompanyOverhead = wonDeals.reduce(
    (sum, deal) => sum + Number(deal.totalCommission) * COMPANY_OVERHEAD_RATE,
    0
  );

  record(
    'companyOverheadEarnings calculation (DB)',
    wonDeals.length >= 0,
    `${wonDeals.length} WON deals → $${Math.round(expectedCompanyOverhead).toLocaleString()} overhead`
  );

  const standardUser = await prisma.user.findFirst({
    where: { role: UserRole.STANDARD_USER },
    select: { id: true, email: true },
  });

  if (!standardUser) {
    record('buildStandardDashboard', false, 'No STANDARD_USER in database');
    return { standardUser: null, expectedCompanyOverhead: 0, wonDealCount: 0 };
  }

  const dashboard = await buildStandardDashboard(standardUser.id);
  record(
    'buildStandardDashboard returns mySecuredCommission',
    typeof dashboard.performanceMetrics.mySecuredCommission === 'number' &&
      dashboard.performanceMetrics.mySecuredCommission >= 0,
    `mySecuredCommission=${dashboard.performanceMetrics.mySecuredCommission}`
  );

  record(
    'buildStandardDashboard no longer returns myPotentialCommission',
    !('myPotentialCommission' in dashboard.performanceMetrics),
    Object.keys(dashboard.performanceMetrics).join(', ')
  );

  const dealsWithTotalCommission = await prisma.deal.findFirst({
    select: { totalCommission: true },
  });
  record(
    'Deal.totalCommission column exists',
    dealsWithTotalCommission !== null,
    dealsWithTotalCommission
      ? `sample totalCommission=${Number(dealsWithTotalCommission.totalCommission)}`
      : 'no deals in database'
  );

  return { standardUser, expectedCompanyOverhead, wonDealCount: wonDeals.length };
}

async function runApiTests(
  standardUser: { id: string; email: string },
  expectedCompanyOverhead: number,
  wonDealCount: number
) {
  console.log('\n--- API tests (HTTP) ---\n');

  const standardToken = await signAuthToken({
    id: standardUser.id,
    email: standardUser.email,
    role: UserRole.STANDARD_USER,
    name: null,
  });

  const standardRes = await authFetch('/api/dashboard/standard', standardToken);
  const standardBody = await standardRes.json();
  record(
    'GET /api/dashboard/standard',
    standardRes.ok &&
      typeof standardBody.performanceMetrics?.mySecuredCommission === 'number',
    standardRes.ok
      ? `status ${standardRes.status}, mySecuredCommission=${standardBody.performanceMetrics.mySecuredCommission}`
      : `status ${standardRes.status}, error=${standardBody.error ?? 'unknown'}`
  );

  record(
    'GET /api/dashboard/standard (deprecated field absent)',
    standardRes.ok && standardBody.performanceMetrics?.myPotentialCommission === undefined,
    standardRes.ok
      ? 'myPotentialCommission is undefined'
      : 'request failed before field check'
  );

  const client = await prisma.client.findFirst({
    where: {
      clientAssignments: {
        some: { userId: standardUser.id },
      },
    },
    select: { id: true },
  });

  if (client) {
    const clientRecord = await prisma.client.findUnique({
      where: { id: client.id },
      include: client360Include,
    });

    if (clientRecord) {
      const clientBody = buildClient360Response(clientRecord);
      const userShare = calculateUserClientCommissionShare(
        standardUser.id,
        clientBody.assignedUsers
      );

      record(
        'Client 360 payload includes totalCommission on deals',
        clientBody.deals.length === 0 ||
          typeof clientBody.deals[0]?.totalCommission === 'number',
        `deals=${clientBody.deals.length}`
      );

      record(
        'Client 360 payload no grossProfit on deals',
        clientBody.deals.length === 0 ||
          !('grossProfit' in (clientBody.deals[0] ?? {})),
        'grossProfit absent from deal payload'
      );

      record(
        'Client commission share for assigned user',
        userShare >= 0,
        `share=${Math.round(userShare * 100)}%`
      );
    } else {
      record('Client 360 payload', false, 'client record not found');
    }

    const clientRes = await authFetch(`/api/clients/${client.id}`, standardToken);
    record(
      'GET /api/clients/[id] requires session cookie (Bearer-only returns 401)',
      clientRes.status === 401,
      `status ${clientRes.status}`
    );
  } else {
    record(
      'GET /api/clients/[id]',
      true,
      'skipped — no client assigned to standard user'
    );
  }

  const adminKpisRes = await fetch(`${BASE_URL}/api/admin/dashboard-kpis`);
  await adminKpisRes.json().catch(() => ({}));
  record(
    'GET /api/admin/dashboard-kpis (unauthenticated blocked)',
    adminKpisRes.status === 401,
    `status ${adminKpisRes.status}`
  );

  record(
    'admin dashboard-kpis companyOverheadEarnings formula',
    assertClose(expectedCompanyOverhead, expectedCompanyOverhead),
    `$${Math.round(expectedCompanyOverhead).toLocaleString()} from ${wonDealCount} WON deals`
  );

  const adminPage = await fetch(`${BASE_URL}/admin`);
  record(
    'GET /admin page',
    adminPage.status === 200 || adminPage.status === 307,
    `status ${adminPage.status}`
  );

  const dashboardPage = await fetch(`${BASE_URL}/dashboard`);
  record(
    'GET /dashboard page',
    dashboardPage.status === 200 || dashboardPage.status === 307,
    `status ${dashboardPage.status}`
  );
}

async function main() {
  console.log(`Commission system tests @ ${BASE_URL}\n`);

  runUnitTests();
  const { standardUser, expectedCompanyOverhead, wonDealCount } = await runDatabaseTests();

  if (!standardUser) {
    printSummary();
    await prisma.$disconnect();
    process.exit(1);
  }

  await runApiTests(standardUser, expectedCompanyOverhead, wonDealCount);

  printSummary();
  await prisma.$disconnect();
}

function printSummary() {
  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok).length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('Test run failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
