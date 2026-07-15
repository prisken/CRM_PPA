/**
 * Integration tests for Client Strategy Builder API routes.
 *
 * Covers permissions, plan/step/connection/expense CRUD, and fetch includes.
 * Exercises route handlers in-process with Bearer JWT (same pattern as
 * scripts/test-client-access.ts).
 *
 * Run: npm run test:client-strategy
 * Or:  npx tsx scripts/test-client-strategy-api.ts
 */
import {
  AssignmentRole,
  ClientStatus,
  DealParticipantRole,
  DealStatus,
  DealType,
  StrategyExpenseCategory,
  StrategyExpenseFrequency,
  StrategyPlanStatus,
  StrategyStepType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import {
  canDeleteClientStrategy,
  canManageClientStrategy,
  canViewClientStrategy,
} from '../lib/clientStrategyPermissions';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import {
  DELETE as deletePlan,
  GET as getPlan,
  PUT as updatePlan,
} from '../src/app/api/clients/[id]/strategy-plans/[planId]/route';
import { POST as createConnection } from '../src/app/api/clients/[id]/strategy-plans/[planId]/connections/route';
import {
  POST as createExpense,
} from '../src/app/api/clients/[id]/strategy-plans/[planId]/expenses/route';
import {
  PUT as updateExpense,
} from '../src/app/api/clients/[id]/strategy-plans/[planId]/expenses/[expenseId]/route';
import {
  GET as listPlans,
  POST as createPlan,
} from '../src/app/api/clients/[id]/strategy-plans/route';
import { POST as createStep } from '../src/app/api/clients/[id]/strategy-plans/[planId]/steps/route';
import {
  DELETE as deleteStepById,
  PUT as updateStep,
} from '../src/app/api/clients/[id]/strategy-plans/[planId]/steps/[stepId]/route';

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
  planIds: [] as string[],
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
  const email = `strategy-api-${key}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Strategy API ${key}`,
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
      name: `STRATEGY API ${label} ${RUN_ID}`,
      email: `strategy-${label.toLowerCase()}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      company: `Strategy Co ${RUN_ID}`,
      status: ClientStatus.ACTIVE_CLIENT,
    },
    select: { id: true, name: true },
  });
  created.clientIds.push(client.id);
  return client;
}

async function authRequest(path: string, token: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

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

async function cleanup() {
  if (created.planIds.length > 0) {
    await prisma.clientStrategyPlan.deleteMany({
      where: { id: { in: created.planIds } },
    });
  }

  if (created.clientIds.length > 0) {
    await prisma.clientStrategyPlan.deleteMany({
      where: { clientId: { in: created.clientIds } },
    });
    await prisma.dealParticipant.deleteMany({
      where: { deal: { clientId: { in: created.clientIds } } },
    });
    await prisma.deal.deleteMany({
      where: { clientId: { in: created.clientIds } },
    });
    await prisma.clientAssignment.deleteMany({
      where: { clientId: { in: created.clientIds } },
    });
    await prisma.clientActivityLog.deleteMany({
      where: { clientId: { in: created.clientIds } },
    });
    await prisma.client.deleteMany({
      where: { id: { in: created.clientIds } },
    });
  }

  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: created.userIds } },
    });
  }
}

async function main() {
  console.log(`Client Strategy Builder API tests @ ${new Date().toISOString()}`);
  console.log(`Run ID: ${RUN_ID}\n`);

  const [superAdmin, doctor, relationshipUser, outsider] = await Promise.all([
    createUser('admin', UserRole.SUPER_ADMIN),
    createUser('doctor', UserRole.STANDARD_USER),
    createUser('relationship', UserRole.STANDARD_USER),
    createUser('outsider', UserRole.STANDARD_USER),
  ]);

  const client = await createClient('PRIMARY');
  const otherClient = await createClient('OTHER');

  await prisma.clientAssignment.createMany({
    data: [
      {
        clientId: client.id,
        userId: doctor.id,
        role: AssignmentRole.DOCTOR,
      },
      {
        clientId: client.id,
        userId: relationshipUser.id,
        role: AssignmentRole.RELATIONSHIP,
      },
    ],
  });

  const deal = await prisma.deal.create({
    data: {
      clientId: client.id,
      name: `Strategy test deal ${RUN_ID}`,
      dealValue: 25000,
      totalCommission: 5000,
      dealType: DealType.INVESTMENT,
      status: DealStatus.PROPOSED,
      participants: {
        create: [
          {
            userId: doctor.id,
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
    select: { id: true, name: true },
  });
  created.dealIds.push(deal.id);

  const otherDeal = await prisma.deal.create({
    data: {
      clientId: otherClient.id,
      name: `Strategy other-client deal ${RUN_ID}`,
      dealValue: 10000,
      totalCommission: 1000,
      dealType: DealType.CUSTOM,
      status: DealStatus.PROPOSED,
    },
    select: { id: true },
  });
  created.dealIds.push(otherDeal.id);

  const adminToken = await tokenFor(superAdmin);
  const doctorToken = await tokenFor(doctor);
  const relationshipToken = await tokenFor(relationshipUser);
  const outsiderToken = await tokenFor(outsider);

  const clientParams = Promise.resolve({ id: client.id });

  // --- 1. Permission helpers ---
  record(
    'canManageClientStrategy (SUPER_ADMIN)',
    await canManageClientStrategy(superAdmin, client.id),
    'allowed'
  );

  record(
    'canManageClientStrategy (DOC assignment)',
    await canManageClientStrategy(doctor, client.id),
    'allowed'
  );

  record(
    'canViewClientStrategy (RELATIONSHIP)',
    await canViewClientStrategy(relationshipUser, client.id),
    'allowed'
  );

  record(
    'canManageClientStrategy (RELATIONSHIP denied)',
    !(await canManageClientStrategy(relationshipUser, client.id)),
    'denied'
  );

  record(
    'canViewClientStrategy (outsider denied)',
    !(await canViewClientStrategy(outsider, client.id)),
    'denied'
  );

  record(
    'canDeleteClientStrategy (outsider denied)',
    !(await canDeleteClientStrategy(outsider, client.id)),
    'denied'
  );

  // --- 1b. Permission at route level ---
  const outsiderCreate = await createPlan(
    await authRequest(`/api/clients/${client.id}/strategy-plans`, outsiderToken, {
      method: 'POST',
      body: JSON.stringify({ title: 'Should fail' }),
    }),
    { params: clientParams }
  );
  record(
    'POST /strategy-plans (unauthorized 403)',
    outsiderCreate.status === 403,
    `status ${outsiderCreate.status}`
  );

  const relationshipCreateDenied = await createPlan(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans`,
      relationshipToken,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Relationship cannot manage' }),
      }
    ),
    { params: clientParams }
  );
  record(
    'POST /strategy-plans (RELATIONSHIP cannot manage 403)',
    relationshipCreateDenied.status === 403,
    `status ${relationshipCreateDenied.status}`
  );

  // --- 2. Strategy plan CRUD ---
  const createAdminRes = await createPlan(
    await authRequest(`/api/clients/${client.id}/strategy-plans`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `Admin Plan ${RUN_ID}`,
        description: 'Created by super admin',
        clientGoal: 'Grow wealth',
      }),
    }),
    { params: clientParams }
  );
  const createAdminBody = (await createAdminRes.json()) as {
    plan?: { id: string; title: string; status: string };
    error?: string;
  };
  const adminPlanId = createAdminBody.plan?.id ?? null;
  if (adminPlanId) {
    created.planIds.push(adminPlanId);
  }
  record(
    'create strategy plan (SUPER_ADMIN)',
    createAdminRes.status === 201 && Boolean(adminPlanId),
    createAdminBody.error ?? `id=${adminPlanId}`
  );

  const createDocRes = await createPlan(
    await authRequest(`/api/clients/${client.id}/strategy-plans`, doctorToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `Doctor Plan ${RUN_ID}`,
        expectedOutcome: 'Stabilize cashflow',
      }),
    }),
    { params: clientParams }
  );
  const createDocBody = (await createDocRes.json()) as {
    plan?: { id: string; title: string };
    error?: string;
  };
  const doctorPlanId = createDocBody.plan?.id ?? null;
  if (doctorPlanId) {
    created.planIds.push(doctorPlanId);
  }
  record(
    'create strategy plan (DOC)',
    createDocRes.status === 201 && Boolean(doctorPlanId),
    createDocBody.error ?? `id=${doctorPlanId}`
  );

  assert(Boolean(doctorPlanId), 'Doctor plan must exist for remaining tests');
  const planId = doctorPlanId!;
  const planParams = Promise.resolve({ id: client.id, planId });

  const listRes = await listPlans(
    await authRequest(`/api/clients/${client.id}/strategy-plans`, doctorToken),
    { params: clientParams }
  );
  const listBody = (await listRes.json()) as {
    plans?: Array<{ id: string }>;
  };
  record(
    'list strategy plans by client',
    listRes.status === 200 &&
      (listBody.plans?.length ?? 0) >= 2 &&
      Boolean(listBody.plans?.some((plan) => plan.id === planId)),
    `count=${listBody.plans?.length ?? 0}`
  );

  const updateRes = await updatePlan(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}`,
      doctorToken,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: `Doctor Plan Updated ${RUN_ID}`,
          status: StrategyPlanStatus.ACTIVE,
        }),
      }
    ),
    { params: planParams }
  );
  const updateBody = (await updateRes.json()) as {
    plan?: { title: string; status: string };
    error?: string;
  };
  record(
    'update strategy plan',
    updateRes.status === 200 &&
      updateBody.plan?.title === `Doctor Plan Updated ${RUN_ID}` &&
      updateBody.plan?.status === StrategyPlanStatus.ACTIVE,
    updateBody.error ?? updateBody.plan?.status ?? 'failed'
  );

  // --- 3. Strategy step CRUD ---
  const stepDealRes = await createStep(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/steps`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Existing investment deal',
          stepType: StrategyStepType.EXISTING_DEAL,
          linkedDealId: deal.id,
          plannedAmount: 25000,
        }),
      }
    ),
    { params: planParams }
  );
  const stepDealBody = (await stepDealRes.json()) as {
    step?: {
      id: string;
      linkedDealId: string | null;
      linkedDeal?: { id: string; name: string } | null;
    };
    error?: string;
  };
  const dealStepId = stepDealBody.step?.id ?? null;
  record(
    'create step linked to deal',
    stepDealRes.status === 201 &&
      stepDealBody.step?.linkedDealId === deal.id &&
      stepDealBody.step?.linkedDeal?.id === deal.id,
    stepDealBody.error ?? `step=${dealStepId}`
  );

  const badDealLinkRes = await createStep(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/steps`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Wrong client deal',
          linkedDealId: otherDeal.id,
        }),
      }
    ),
    { params: planParams }
  );
  record(
    'create step with other-client deal rejected',
    badDealLinkRes.status === 400,
    `status ${badDealLinkRes.status}`
  );

  const manualStepRes = await createStep(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/steps`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Manual review',
          stepType: StrategyStepType.MANUAL,
          purpose: 'Quarterly check-in',
        }),
      }
    ),
    { params: planParams }
  );
  const manualStepBody = (await manualStepRes.json()) as {
    step?: { id: string; stepType: string };
    error?: string;
  };
  const manualStepId = manualStepBody.step?.id ?? null;
  record(
    'create manual step',
    manualStepRes.status === 201 &&
      manualStepBody.step?.stepType === StrategyStepType.MANUAL,
    manualStepBody.error ?? `step=${manualStepId}`
  );

  const plannedStepRes = await createStep(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/steps`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Planned property deal',
          stepType: StrategyStepType.PLANNED_DEAL,
          plannedAmount: 500000,
          amountDescription: 'Projected purchase',
        }),
      }
    ),
    { params: planParams }
  );
  const plannedStepBody = (await plannedStepRes.json()) as {
    step?: { id: string; stepType: string; plannedAmount: number | null };
    error?: string;
  };
  const plannedStepId = plannedStepBody.step?.id ?? null;
  record(
    'create planned step',
    plannedStepRes.status === 201 &&
      plannedStepBody.step?.stepType === StrategyStepType.PLANNED_DEAL &&
      plannedStepBody.step?.plannedAmount === 500000,
    plannedStepBody.error ?? `step=${plannedStepId}`
  );

  assert(Boolean(dealStepId && manualStepId && plannedStepId), 'Steps required');

  const updateStepRes = await updateStep(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/steps/${manualStepId}`,
      doctorToken,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Manual review updated',
          timelineLabel: 'Q3',
        }),
      }
    ),
    {
      params: Promise.resolve({
        id: client.id,
        planId,
        stepId: manualStepId!,
      }),
    }
  );
  const updateStepBody = (await updateStepRes.json()) as {
    step?: { title: string; timelineLabel: string | null };
    error?: string;
  };
  record(
    'update strategy step',
    updateStepRes.status === 200 &&
      updateStepBody.step?.title === 'Manual review updated' &&
      updateStepBody.step?.timelineLabel === 'Q3',
    updateStepBody.error ?? updateStepBody.step?.title ?? 'failed'
  );

  // Second plan for cross-plan validation
  const otherPlanRes = await createPlan(
    await authRequest(`/api/clients/${client.id}/strategy-plans`, doctorToken, {
      method: 'POST',
      body: JSON.stringify({ title: `Other Plan ${RUN_ID}` }),
    }),
    { params: clientParams }
  );
  const otherPlanBody = (await otherPlanRes.json()) as {
    plan?: { id: string };
  };
  const otherPlanId = otherPlanBody.plan?.id ?? null;
  if (otherPlanId) {
    created.planIds.push(otherPlanId);
  }
  assert(Boolean(otherPlanId), 'Other plan required for cross-plan tests');

  const otherPlanStepRes = await createStep(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${otherPlanId}/steps`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Other plan step' }),
      }
    ),
    { params: Promise.resolve({ id: client.id, planId: otherPlanId! }) }
  );
  const otherPlanStepBody = (await otherPlanStepRes.json()) as {
    step?: { id: string };
  };
  const otherPlanStepId = otherPlanStepBody.step?.id ?? null;
  assert(Boolean(otherPlanStepId), 'Other plan step required');

  // --- 4. Strategy connection validation ---
  const selfConnRes = await createConnection(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/connections`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          fromStepId: dealStepId,
          toStepId: dealStepId,
        }),
      }
    ),
    { params: planParams }
  );
  record(
    'connection cannot link step to itself',
    selfConnRes.status === 400,
    `status ${selfConnRes.status}`
  );

  const crossPlanConnRes = await createConnection(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/connections`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          fromStepId: dealStepId,
          toStepId: otherPlanStepId,
        }),
      }
    ),
    { params: planParams }
  );
  record(
    'connection cannot link steps from different plans',
    crossPlanConnRes.status === 400,
    `status ${crossPlanConnRes.status}`
  );

  const validConnRes = await createConnection(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/connections`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          fromStepId: dealStepId,
          toStepId: plannedStepId,
          purpose: 'Fund planned purchase',
        }),
      }
    ),
    { params: planParams }
  );
  const validConnBody = (await validConnRes.json()) as {
    connection?: { id: string; fromStepId: string; toStepId: string };
    error?: string;
  };
  const connectionId = validConnBody.connection?.id ?? null;
  record(
    'create valid connection',
    validConnRes.status === 201 &&
      validConnBody.connection?.fromStepId === dealStepId &&
      validConnBody.connection?.toStepId === plannedStepId,
    validConnBody.error ?? `connection=${connectionId}`
  );

  // --- 5. Strategy expense validation ---
  const expenseRes = await createExpense(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/expenses`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'School fees',
          category: StrategyExpenseCategory.EDUCATION,
          amount: 2000,
          frequency: StrategyExpenseFrequency.MONTHLY,
        }),
      }
    ),
    { params: planParams }
  );
  const expenseBody = (await expenseRes.json()) as {
    expense?: { id: string; title: string };
    error?: string;
  };
  const expenseId = expenseBody.expense?.id ?? null;
  record(
    'create expense',
    expenseRes.status === 201 && Boolean(expenseId),
    expenseBody.error ?? `expense=${expenseId}`
  );

  assert(Boolean(expenseId), 'Expense required for link tests');

  const coveredOkRes = await updateExpense(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/expenses/${expenseId}`,
      doctorToken,
      {
        method: 'PUT',
        body: JSON.stringify({ coveredByStepId: dealStepId }),
      }
    ),
    {
      params: Promise.resolve({
        id: client.id,
        planId,
        expenseId: expenseId!,
      }),
    }
  );
  const coveredOkBody = (await coveredOkRes.json()) as {
    expense?: {
      coveredByStepId: string | null;
      coveredByStep?: { id: string } | null;
    };
    error?: string;
  };
  record(
    'link expense to coveredByStep',
    coveredOkRes.status === 200 &&
      coveredOkBody.expense?.coveredByStepId === dealStepId &&
      coveredOkBody.expense?.coveredByStep?.id === dealStepId,
    coveredOkBody.error ?? 'ok'
  );

  const coveredBadRes = await updateExpense(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/expenses/${expenseId}`,
      doctorToken,
      {
        method: 'PUT',
        body: JSON.stringify({ coveredByStepId: otherPlanStepId }),
      }
    ),
    {
      params: Promise.resolve({
        id: client.id,
        planId,
        expenseId: expenseId!,
      }),
    }
  );
  record(
    'cannot link expense to step from another plan',
    coveredBadRes.status === 400,
    `status ${coveredBadRes.status}`
  );

  // --- 6. Fetch plan includes ---
  const getRes = await getPlan(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}`,
      relationshipToken
    ),
    { params: planParams }
  );
  const getBody = (await getRes.json()) as {
    plan?: {
      id: string;
      steps: Array<{
        id: string;
        linkedDeal?: { id: string; name: string } | null;
      }>;
      connections: Array<{ id: string }>;
      expenses: Array<{
        id: string;
        coveredByStep?: { id: string } | null;
      }>;
    };
    error?: string;
  };
  const fetched = getBody.plan;
  record(
    'fetch plan includes steps',
    getRes.status === 200 && (fetched?.steps.length ?? 0) >= 3,
    `steps=${fetched?.steps.length ?? 0}`
  );
  record(
    'fetch plan includes connections',
    Boolean(fetched?.connections.some((c) => c.id === connectionId)),
    `connections=${fetched?.connections.length ?? 0}`
  );
  record(
    'fetch plan includes expenses',
    Boolean(fetched?.expenses.some((e) => e.id === expenseId)),
    `expenses=${fetched?.expenses.length ?? 0}`
  );
  record(
    'fetch plan includes linked deal details',
    Boolean(
      fetched?.steps.some(
        (step) =>
          step.id === dealStepId && step.linkedDeal?.id === deal.id
      )
    ),
    fetched?.steps.find((step) => step.id === dealStepId)?.linkedDeal?.name ??
      'missing'
  );
  record(
    'RELATIONSHIP can view plan detail',
    getRes.status === 200,
    `status ${getRes.status}`
  );

  // Delete a step (temporary) then recreate count check via delete endpoint
  const tempStepRes = await createStep(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/steps`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Temp step to delete' }),
      }
    ),
    { params: planParams }
  );
  const tempStepBody = (await tempStepRes.json()) as { step?: { id: string } };
  const tempStepId = tempStepBody.step?.id ?? null;
  const deleteStepRes = tempStepId
    ? await deleteStepById(
        await authRequest(
          `/api/clients/${client.id}/strategy-plans/${planId}/steps/${tempStepId}`,
          doctorToken,
          { method: 'DELETE' }
        ),
        {
          params: Promise.resolve({
            id: client.id,
            planId,
            stepId: tempStepId,
          }),
        }
      )
    : null;
  record(
    'delete strategy step',
    Boolean(deleteStepRes && deleteStepRes.status === 200),
    `status ${deleteStepRes?.status ?? 'n/a'}`
  );

  // --- 2b. Archive / hard delete plans ---
  assert(Boolean(adminPlanId), 'Admin plan required for archive test');
  const archiveRes = await deletePlan(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${adminPlanId}`,
      adminToken,
      { method: 'DELETE' }
    ),
    { params: Promise.resolve({ id: client.id, planId: adminPlanId! }) }
  );
  const archiveBody = (await archiveRes.json()) as {
    archived?: boolean;
    plan?: { status: string };
    error?: string;
  };
  record(
    'archive strategy plan (DELETE default)',
    archiveRes.status === 200 &&
      archiveBody.archived === true &&
      archiveBody.plan?.status === StrategyPlanStatus.ARCHIVED,
    archiveBody.error ?? archiveBody.plan?.status ?? 'failed'
  );

  const hardDeleteRes = await deletePlan(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${otherPlanId}?hard=true`,
      doctorToken,
      { method: 'DELETE' }
    ),
    { params: Promise.resolve({ id: client.id, planId: otherPlanId! }) }
  );
  const hardDeleteBody = (await hardDeleteRes.json()) as {
    deleted?: boolean;
    error?: string;
  };
  if (hardDeleteRes.status === 200) {
    created.planIds = created.planIds.filter((id) => id !== otherPlanId);
  }
  record(
    'hard delete strategy plan',
    hardDeleteRes.status === 200 && hardDeleteBody.deleted === true,
    hardDeleteBody.error ?? `status ${hardDeleteRes.status}`
  );

  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok).length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);

  await cleanup();

  assert(failed === 0, `${failed} client strategy API test(s) failed`);
  console.log('\nPASS');
}

main()
  .catch(async (error) => {
    console.error('\nFAIL', error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
