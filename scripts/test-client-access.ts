/**
 * Authorization checks for Client 360 core read and company hierarchy APIs.
 *
 * Exercises auth helpers + HTTP route handlers with Bearer JWT.
 *
 * Run: npm run test:client-access
 * Or:  npx tsx scripts/test-client-access.ts
 *
 * Optional: TEST_BASE_URL=http://localhost:3000 for live HTTP probes
 * (defaults to calling route handlers in-process via imported GET/POST).
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
import {
  canAccessClientHierarchy,
  canAccessDealParticipantPicker,
  canReadClientCore,
  canViewClientDeals,
  requireClientCoreReadAccess,
  requireClientEmployeeLeadCreateAccess,
  requireClientHierarchyAccess,
} from '../lib/authHelpers';
import { resolveClient360PageAccess } from '../lib/client360PageAccess';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import {
  GET as getClientCore,
} from '../src/app/api/clients/[id]/route';
import {
  GET as getEmployees,
  POST as postEmployees,
} from '../src/app/api/clients/[id]/employees/route';
import { GET as getSourceRecords } from '../src/app/api/clients/[id]/source-records/route';
import { GET as getDealDetail } from '../src/app/api/clients/[id]/deals/[dealId]/route';
import { GET as getParticipantUsers } from '../src/app/api/clients/[id]/deals/participant-users/route';

const RUN_ID = Date.now();
const TEST_EMAIL_DOMAIN = 'example.test';

type TestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: TestResult[] = [];

const created = {
  userIds: [] as string[],
  clientIds: [] as string[],
  dealIds: [] as string[],
};

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
  const email = `client-access-${key}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Access Test ${key}`,
      role,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true, role: true, name: true },
  });
  created.userIds.push(user.id);
  return user;
}

async function createClient(label: string) {
  const client = await prisma.client.create({
    data: {
      name: `ACCESS TEST ${label} ${RUN_ID}`,
      email: `access-${label}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      company: `Access Co ${RUN_ID}`,
      status: ClientStatus.NEW_LEAD,
    },
    select: { id: true, name: true },
  });
  created.clientIds.push(client.id);
  return client;
}

async function authRequest(
  path: string,
  token: string,
  init?: RequestInit
) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function cleanup() {
  if (created.dealIds.length > 0) {
    await prisma.dealParticipant.deleteMany({
      where: { dealId: { in: created.dealIds } },
    });
    await prisma.deal.deleteMany({
      where: { id: { in: created.dealIds } },
    });
  }

  if (created.clientIds.length > 0) {
    await prisma.clientAssignment.deleteMany({
      where: { clientId: { in: created.clientIds } },
    });
    await prisma.client.deleteMany({
      where: {
        OR: [
          { id: { in: created.clientIds } },
          { name: { startsWith: `ACCESS TEST EMP ` } },
          { email: { contains: `access-emp-${RUN_ID}@` } },
        ],
      },
    });
  }

  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: created.userIds } },
    });
  }
}

async function main() {
  console.log(`Client access auth tests @ ${new Date().toISOString()}`);
  console.log(`Run ID: ${RUN_ID}\n`);

  const [superAdmin, assignedUser, outsider, participantOnly] = await Promise.all([
    createUser('admin', UserRole.SUPER_ADMIN),
    createUser('assigned', UserRole.STANDARD_USER),
    createUser('outsider', UserRole.STANDARD_USER),
    createUser('participant', UserRole.STANDARD_USER),
  ]);

  const client = await createClient('CLIENT');

  await prisma.clientAssignment.create({
    data: {
      clientId: client.id,
      userId: assignedUser.id,
      role: AssignmentRole.RELATIONSHIP,
    },
  });

  const deal = await prisma.deal.create({
    data: {
      clientId: client.id,
      name: `Access test deal ${RUN_ID}`,
      dealValue: 10000,
      totalCommission: 1000,
      dealType: DealType.CUSTOM,
      status: DealStatus.PROPOSED,
      participants: {
        create: [
          {
            userId: participantOnly.id,
            role: DealParticipantRole.DOCTOR,
            commissionPercent: 60,
            isCommissionable: true,
          },
          {
            externalName: 'Profit Pulse Ally',
            role: DealParticipantRole.COMPANY,
            commissionPercent: 40,
            isCommissionable: true,
          },
        ],
      },
    },
    select: { id: true },
  });
  created.dealIds.push(deal.id);

  console.log(`Client: ${client.id}`);
  console.log(`Assigned: ${assignedUser.email}`);
  console.log(`Outsider: ${outsider.email}`);
  console.log(`Participant-only: ${participantOnly.email}\n`);

  // --- Helper-level checks ---
  record(
    'canReadClientCore (super admin)',
    await canReadClientCore(superAdmin.id, superAdmin.role, client.id),
    'allowed'
  );

  record(
    'canReadClientCore (assigned standard)',
    await canReadClientCore(assignedUser.id, assignedUser.role, client.id),
    'allowed'
  );

  record(
    'canReadClientCore (deal participant)',
    await canReadClientCore(participantOnly.id, participantOnly.role, client.id),
    'allowed'
  );

  record(
    'canReadClientCore (outsider)',
    !(await canReadClientCore(outsider.id, outsider.role, client.id)),
    'denied'
  );

  record(
    'canAccessClientHierarchy (assigned)',
    await canAccessClientHierarchy(assignedUser.id, assignedUser.role, client.id),
    'allowed'
  );

  record(
    'canAccessClientHierarchy (deal participant denied)',
    !(await canAccessClientHierarchy(
      participantOnly.id,
      participantOnly.role,
      client.id
    )),
    'denied'
  );

  // Phase 2I.2 light deal view / picker gates
  record(
    'canViewClientDeals (assigned RELATIONSHIP)',
    await canViewClientDeals(assignedUser.id, assignedUser.role, client.id),
    'allowed'
  );
  record(
    'canViewClientDeals (DOCTOR participant)',
    await canViewClientDeals(
      participantOnly.id,
      participantOnly.role,
      client.id
    ),
    'allowed'
  );
  record(
    'canViewClientDeals (outsider)',
    !(await canViewClientDeals(outsider.id, outsider.role, client.id)),
    'denied'
  );
  record(
    'canAccessDealParticipantPicker (assigned)',
    await canAccessDealParticipantPicker(
      assignedUser.id,
      assignedUser.role,
      client.id
    ),
    'allowed'
  );
  record(
    'canAccessDealParticipantPicker (outsider)',
    !(await canAccessDealParticipantPicker(
      outsider.id,
      outsider.role,
      client.id
    )),
    'denied'
  );

  // Phase 2K: RSC page access resolve-once
  {
    const adminPageAccess = await resolveClient360PageAccess(superAdmin, client.id);
    record(
      'resolveClient360PageAccess (SUPER_ADMIN)',
      Boolean(adminPageAccess?.dealAccess.canView) &&
        Boolean(adminPageAccess?.dealAccess.canManageAll) &&
        (adminPageAccess?.dealAccess.manageableDealIds.length ?? -1) === 0 &&
        Boolean(adminPageAccess?.strategyAccess.canManage) &&
        Boolean(adminPageAccess?.canViewHierarchy),
      adminPageAccess
        ? `manageAll=${adminPageAccess.dealAccess.canManageAll} ids=${adminPageAccess.dealAccess.manageableDealIds.length}`
        : 'null'
    );

    const assignedPageAccess = await resolveClient360PageAccess(
      assignedUser,
      client.id
    );
    record(
      'resolveClient360PageAccess (assigned RELATIONSHIP)',
      Boolean(assignedPageAccess?.dealAccess.canView) &&
        Boolean(assignedPageAccess?.dealAccess.canCreate) &&
        assignedPageAccess?.strategyAccess.canView === true &&
        assignedPageAccess?.strategyAccess.canManage === false &&
        Boolean(assignedPageAccess?.canViewHierarchy),
      assignedPageAccess
        ? `canCreate=${assignedPageAccess.dealAccess.canCreate} hierarchy=${assignedPageAccess.canViewHierarchy}`
        : 'null'
    );

    const participantPageAccess = await resolveClient360PageAccess(
      participantOnly,
      client.id
    );
    record(
      'resolveClient360PageAccess (DOCTOR participant)',
      Boolean(participantPageAccess?.dealAccess.canView) &&
        participantPageAccess?.canViewHierarchy === false &&
        participantPageAccess?.strategyAccess.canManage === true,
      participantPageAccess
        ? `hierarchy=${participantPageAccess.canViewHierarchy} manageStrategy=${participantPageAccess.strategyAccess.canManage}`
        : 'null'
    );

    const outsiderPageAccess = await resolveClient360PageAccess(
      outsider,
      client.id
    );
    record(
      'resolveClient360PageAccess (outsider null)',
      outsiderPageAccess === null,
      outsiderPageAccess ? 'allowed unexpectedly' : 'null'
    );
  }

  record(
    'canAccessClientHierarchy (outsider denied)',
    !(await canAccessClientHierarchy(outsider.id, outsider.role, client.id)),
    'denied'
  );

  const outsiderCore = await requireClientCoreReadAccess(
    client.id,
    await authRequest(`/api/clients/${client.id}`, await signAuthToken(outsider))
  );
  record(
    'requireClientCoreReadAccess (outsider)',
    Boolean(outsiderCore.error) && outsiderCore.error!.status === 403,
    `status ${outsiderCore.error?.status ?? 'ok'}`
  );

  const assignedCore = await requireClientCoreReadAccess(
    client.id,
    await authRequest(
      `/api/clients/${client.id}`,
      await signAuthToken(assignedUser)
    )
  );
  record(
    'requireClientCoreReadAccess (assigned)',
    !assignedCore.error && assignedCore.user?.id === assignedUser.id,
    assignedCore.error ? `status ${assignedCore.error.status}` : 'ok'
  );

  const participantHierarchy = await requireClientHierarchyAccess(
    client.id,
    await authRequest(
      `/api/clients/${client.id}/employees`,
      await signAuthToken(participantOnly)
    )
  );
  record(
    'requireClientHierarchyAccess (participant denied)',
    Boolean(participantHierarchy.error) &&
      participantHierarchy.error!.status === 403,
    `status ${participantHierarchy.error?.status ?? 'ok'}`
  );

  const outsiderCreate = await requireClientEmployeeLeadCreateAccess(
    client.id,
    await authRequest(
      `/api/clients/${client.id}/employees`,
      await signAuthToken(outsider)
    )
  );
  record(
    'requireClientEmployeeLeadCreateAccess (outsider denied)',
    Boolean(outsiderCreate.error) && outsiderCreate.error!.status === 403,
    `status ${outsiderCreate.error?.status ?? 'ok'}`
  );

  // --- Route handler checks (Bearer) ---
  const params = Promise.resolve({ id: client.id });

  const adminGet = await getClientCore(
    await authRequest(`/api/clients/${client.id}`, await signAuthToken(superAdmin)),
    { params }
  );
  record(
    'GET /api/clients/[id] (super admin)',
    adminGet.status === 200,
    `status ${adminGet.status}`
  );

  const assignedGet = await getClientCore(
    await authRequest(
      `/api/clients/${client.id}`,
      await signAuthToken(assignedUser)
    ),
    { params }
  );
  record(
    'GET /api/clients/[id] (assigned)',
    assignedGet.status === 200,
    `status ${assignedGet.status}`
  );

  const participantGet = await getClientCore(
    await authRequest(
      `/api/clients/${client.id}`,
      await signAuthToken(participantOnly)
    ),
    { params }
  );
  record(
    'GET /api/clients/[id] (deal participant)',
    participantGet.status === 200,
    `status ${participantGet.status}`
  );

  const outsiderGet = await getClientCore(
    await authRequest(`/api/clients/${client.id}`, await signAuthToken(outsider)),
    { params }
  );
  record(
    'GET /api/clients/[id] (outsider 403)',
    outsiderGet.status === 403,
    `status ${outsiderGet.status}`
  );

  // Phase 2I.1: source-records 403-first; conditional clientLookup for admin empty miss
  {
    const missingClientId = `missing-client-sources-${RUN_ID}`;
    const outsiderSources = await getSourceRecords(
      await authRequest(
        `/api/clients/${client.id}/source-records`,
        await signAuthToken(outsider)
      ),
      { params }
    );
    record(
      'GET /source-records (outsider existing client 403)',
      outsiderSources.status === 403,
      `status ${outsiderSources.status}`
    );

    const outsiderSourcesMissing = await getSourceRecords(
      await authRequest(
        `/api/clients/${missingClientId}/source-records`,
        await signAuthToken(outsider)
      ),
      { params: Promise.resolve({ id: missingClientId }) }
    );
    record(
      'GET /source-records (outsider missing client 403)',
      outsiderSourcesMissing.status === 403,
      `status ${outsiderSourcesMissing.status}`
    );

    const adminSourcesMissing = await getSourceRecords(
      await authRequest(
        `/api/clients/${missingClientId}/source-records`,
        await signAuthToken(superAdmin)
      ),
      { params: Promise.resolve({ id: missingClientId }) }
    );
    const adminSourcesBody = (await adminSourcesMissing.json()) as {
      error?: string;
    };
    record(
      'GET /source-records (SUPER_ADMIN missing client 404)',
      adminSourcesMissing.status === 404 &&
        adminSourcesBody.error === 'Client not found',
      `status ${adminSourcesMissing.status} error=${adminSourcesBody.error ?? ''}`
    );

    const assignedSources = await getSourceRecords(
      await authRequest(
        `/api/clients/${client.id}/source-records`,
        await signAuthToken(assignedUser)
      ),
      { params }
    );
    const assignedSourcesBody = (await assignedSources.json()) as {
      sourceRecords?: unknown[];
    };
    record(
      'GET /source-records (assigned empty 200)',
      assignedSources.status === 200 &&
        Array.isArray(assignedSourcesBody.sourceRecords),
      `status ${assignedSources.status} count=${assignedSourcesBody.sourceRecords?.length ?? 'n/a'}`
    );
  }

  // Phase 2I.2: deal detail + participant-users light gates (403-first)
  {
    const dealParams = Promise.resolve({ id: client.id, dealId: deal.id });
    const missingClientId = `missing-client-deals-${RUN_ID}`;
    const missingDealParams = Promise.resolve({
      id: missingClientId,
      dealId: `missing-deal-${RUN_ID}`,
    });

    const outsiderDetail = await getDealDetail(
      await authRequest(
        `/api/clients/${client.id}/deals/${deal.id}`,
        await signAuthToken(outsider)
      ),
      { params: dealParams }
    );
    record(
      'GET /deals/[dealId] (outsider existing 403)',
      outsiderDetail.status === 403,
      `status ${outsiderDetail.status}`
    );

    const outsiderDetailMissing = await getDealDetail(
      await authRequest(
        `/api/clients/${missingClientId}/deals/missing-deal-${RUN_ID}`,
        await signAuthToken(outsider)
      ),
      { params: missingDealParams }
    );
    record(
      'GET /deals/[dealId] (outsider missing client 403)',
      outsiderDetailMissing.status === 403,
      `status ${outsiderDetailMissing.status}`
    );

    const adminDetailMissing = await getDealDetail(
      await authRequest(
        `/api/clients/${missingClientId}/deals/missing-deal-${RUN_ID}`,
        await signAuthToken(superAdmin)
      ),
      { params: missingDealParams }
    );
    const adminDetailMissingBody = (await adminDetailMissing.json()) as {
      error?: string;
    };
    record(
      'GET /deals/[dealId] (SUPER_ADMIN missing client 404)',
      adminDetailMissing.status === 404 &&
        adminDetailMissingBody.error === 'Client not found',
      `status ${adminDetailMissing.status} error=${adminDetailMissingBody.error ?? ''}`
    );

    const assignedDetail = await getDealDetail(
      await authRequest(
        `/api/clients/${client.id}/deals/${deal.id}`,
        await signAuthToken(assignedUser)
      ),
      { params: dealParams }
    );
    record(
      'GET /deals/[dealId] (assigned 200)',
      assignedDetail.status === 200,
      `status ${assignedDetail.status}`
    );

    const outsiderPicker = await getParticipantUsers(
      await authRequest(
        `/api/clients/${client.id}/deals/participant-users`,
        await signAuthToken(outsider)
      ),
      { params }
    );
    record(
      'GET /participant-users (outsider 403)',
      outsiderPicker.status === 403,
      `status ${outsiderPicker.status}`
    );

    const assignedPicker = await getParticipantUsers(
      await authRequest(
        `/api/clients/${client.id}/deals/participant-users`,
        await signAuthToken(assignedUser)
      ),
      { params }
    );
    const assignedPickerBody = (await assignedPicker.json()) as {
      users?: unknown[];
    };
    record(
      'GET /participant-users (assigned 200)',
      assignedPicker.status === 200 && Array.isArray(assignedPickerBody.users),
      `status ${assignedPicker.status} users=${assignedPickerBody.users?.length ?? 'n/a'}`
    );
  }

  const outsiderEmployeesGet = await getEmployees(
    await authRequest(
      `/api/clients/${client.id}/employees`,
      await signAuthToken(outsider)
    ),
    { params }
  );
  record(
    'GET /employees (outsider 403)',
    outsiderEmployeesGet.status === 403,
    `status ${outsiderEmployeesGet.status}`
  );

  const participantEmployeesGet = await getEmployees(
    await authRequest(
      `/api/clients/${client.id}/employees`,
      await signAuthToken(participantOnly)
    ),
    { params }
  );
  record(
    'GET /employees (deal participant 403)',
    participantEmployeesGet.status === 403,
    `status ${participantEmployeesGet.status}`
  );

  const assignedEmployeesGet = await getEmployees(
    await authRequest(
      `/api/clients/${client.id}/employees`,
      await signAuthToken(assignedUser)
    ),
    { params }
  );
  record(
    'GET /employees (assigned)',
    assignedEmployeesGet.status === 200,
    `status ${assignedEmployeesGet.status}`
  );

  const outsiderEmployeesPost = await postEmployees(
    await authRequest(
      `/api/clients/${client.id}/employees`,
      await signAuthToken(outsider),
      {
        method: 'POST',
        body: JSON.stringify({
          fullName: `ACCESS TEST EMP OUTSIDER ${RUN_ID}`,
          roleInCompany: 'Tester',
        }),
      }
    ),
    { params }
  );
  record(
    'POST /employees (outsider 403)',
    outsiderEmployeesPost.status === 403,
    `status ${outsiderEmployeesPost.status}`
  );

  const participantEmployeesPost = await postEmployees(
    await authRequest(
      `/api/clients/${client.id}/employees`,
      await signAuthToken(participantOnly),
      {
        method: 'POST',
        body: JSON.stringify({
          fullName: `ACCESS TEST EMP PARTICIPANT ${RUN_ID}`,
          roleInCompany: 'Tester',
        }),
      }
    ),
    { params }
  );
  record(
    'POST /employees (deal participant 403)',
    participantEmployeesPost.status === 403,
    `status ${participantEmployeesPost.status}`
  );

  const assignedEmployeesPost = await postEmployees(
    await authRequest(
      `/api/clients/${client.id}/employees`,
      await signAuthToken(assignedUser),
      {
        method: 'POST',
        body: JSON.stringify({
          fullName: `ACCESS TEST EMP ASSIGNED ${RUN_ID}`,
          roleInCompany: 'Analyst',
        }),
      }
    ),
    { params }
  );

  let createdEmployeeId: string | null = null;
  if (assignedEmployeesPost.status === 201) {
    const body = (await assignedEmployeesPost.json()) as {
      client_id?: string;
      assignment_id?: string;
    };
    createdEmployeeId = body.client_id ?? null;
    if (createdEmployeeId) {
      created.clientIds.push(createdEmployeeId);
    }

    const relationshipAssignment = createdEmployeeId
      ? await prisma.clientAssignment.findFirst({
          where: {
            clientId: createdEmployeeId,
            userId: assignedUser.id,
            role: AssignmentRole.RELATIONSHIP,
          },
        })
      : null;

    record(
      'POST /employees (assigned + RELATIONSHIP auto-assign)',
      Boolean(body.assignment_id) && Boolean(relationshipAssignment),
      `employee=${createdEmployeeId ?? 'none'}`
    );
  } else {
    record(
      'POST /employees (assigned + RELATIONSHIP auto-assign)',
      false,
      `status ${assignedEmployeesPost.status}`
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);

  await cleanup();

  assert(failed === 0, `${failed} client access test(s) failed`);
  console.log('\nPASS');
}

main()
  .catch(async (error) => {
    console.error('Client access tests failed:', error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
