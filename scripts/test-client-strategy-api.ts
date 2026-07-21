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
  StrategyProjectionMilestoneType,
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
  PUT as updateProjectionMilestone,
} from '../src/app/api/clients/[id]/strategy-plans/[planId]/projection-milestones/[milestoneId]/route';
import { PUT as reorderProjectionMilestones } from '../src/app/api/clients/[id]/strategy-plans/[planId]/projection-milestones/reorder/route';
import {
  GET as listProjectionMilestones,
  POST as createProjectionMilestone,
} from '../src/app/api/clients/[id]/strategy-plans/[planId]/projection-milestones/route';
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

  // Phase 2I.3: 403-first — outsider must not learn client existence via strategy GET
  const missingClientId = `missing-client-${RUN_ID}`;
  const outsiderListExisting = await listPlans(
    await authRequest(`/api/clients/${client.id}/strategy-plans`, outsiderToken),
    { params: clientParams }
  );
  record(
    'GET /strategy-plans (outsider existing client 403)',
    outsiderListExisting.status === 403,
    `status ${outsiderListExisting.status}`
  );

  const outsiderListMissing = await listPlans(
    await authRequest(
      `/api/clients/${missingClientId}/strategy-plans`,
      outsiderToken
    ),
    { params: Promise.resolve({ id: missingClientId }) }
  );
  record(
    'GET /strategy-plans (outsider missing client 403)',
    outsiderListMissing.status === 403,
    `status ${outsiderListMissing.status}`
  );

  const outsiderDetailMissing = await getPlan(
    await authRequest(
      `/api/clients/${missingClientId}/strategy-plans/missing-plan-${RUN_ID}`,
      outsiderToken
    ),
    {
      params: Promise.resolve({
        id: missingClientId,
        planId: `missing-plan-${RUN_ID}`,
      }),
    }
  );
  record(
    'GET /strategy-plans/[planId] (outsider missing client 403)',
    outsiderDetailMissing.status === 403,
    `status ${outsiderDetailMissing.status}`
  );

  const adminListMissing = await listPlans(
    await authRequest(
      `/api/clients/${missingClientId}/strategy-plans`,
      adminToken
    ),
    { params: Promise.resolve({ id: missingClientId }) }
  );
  const adminListMissingBody = (await adminListMissing.json()) as {
    error?: string;
  };
  record(
    'GET /strategy-plans (SUPER_ADMIN missing client 404)',
    adminListMissing.status === 404 &&
      adminListMissingBody.error === 'Client not found',
    `status ${adminListMissing.status} error=${adminListMissingBody.error ?? ''}`
  );

  const adminDetailMissing = await getPlan(
    await authRequest(
      `/api/clients/${missingClientId}/strategy-plans/missing-plan-${RUN_ID}`,
      adminToken
    ),
    {
      params: Promise.resolve({
        id: missingClientId,
        planId: `missing-plan-${RUN_ID}`,
      }),
    }
  );
  const adminDetailMissingBody = (await adminDetailMissing.json()) as {
    error?: string;
  };
  record(
    'GET /strategy-plans/[planId] (SUPER_ADMIN missing client 404)',
    adminDetailMissing.status === 404 &&
      adminDetailMissingBody.error === 'Client not found',
    `status ${adminDetailMissing.status} error=${adminDetailMissingBody.error ?? ''}`
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

  // --- 5b. Projection milestones ---
  const milestoneCreateRes = await createProjectionMilestone(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          year: 2030,
          title: 'Income year 5',
          type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
          stepId: dealStepId,
          monthlyIncome: 1000,
          monthsOfIncome: 12,
          // Manual override — must NOT be rewritten as 1000 * 12
          cumulativeIncome: 9999,
          capitalRemaining: 50000,
          totalAssetPosition: 12345,
        }),
      }
    ),
    { params: planParams }
  );
  const milestoneCreateBody = (await milestoneCreateRes.json()) as {
    projectionMilestone?: {
      id: string;
      cumulativeIncome: number | null;
      totalAssetPosition: number | null;
      year: number;
    };
    error?: string;
  };
  const milestoneId = milestoneCreateBody.projectionMilestone?.id ?? null;
  record(
    'create projection milestone preserves manual totals',
    milestoneCreateRes.status === 201 &&
      milestoneCreateBody.projectionMilestone?.cumulativeIncome === 9999 &&
      milestoneCreateBody.projectionMilestone?.totalAssetPosition === 12345 &&
      milestoneCreateBody.projectionMilestone?.year === 2030,
    milestoneCreateBody.error ??
      `cum=${milestoneCreateBody.projectionMilestone?.cumulativeIncome}`
  );

  const milestoneBadYearRes = await createProjectionMilestone(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          year: 1200,
          title: 'Too early',
          type: StrategyProjectionMilestoneType.CUSTOM,
        }),
      }
    ),
    { params: planParams }
  );
  record(
    'projection milestone rejects out-of-range year',
    milestoneBadYearRes.status === 400,
    `status ${milestoneBadYearRes.status}`
  );

  const milestoneBadStepRes = await createProjectionMilestone(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          year: 2031,
          title: 'Cross plan step',
          type: StrategyProjectionMilestoneType.CUSTOM,
          stepId: otherPlanStepId,
        }),
      }
    ),
    { params: planParams }
  );
  record(
    'projection milestone rejects step from another plan',
    milestoneBadStepRes.status === 400,
    `status ${milestoneBadStepRes.status}`
  );

  const milestoneSecondRes = await createProjectionMilestone(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          year: 2040,
          title: 'Exit',
          type: StrategyProjectionMilestoneType.EXIT_SCENARIO,
        }),
      }
    ),
    { params: planParams }
  );
  const milestoneSecondBody = (await milestoneSecondRes.json()) as {
    projectionMilestone?: { id: string };
  };
  const milestoneSecondId = milestoneSecondBody.projectionMilestone?.id ?? null;

  const listMilestonesRes = await listProjectionMilestones(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones`,
      relationshipToken
    ),
    { params: planParams }
  );
  const listMilestonesBody = (await listMilestonesRes.json()) as {
    projectionMilestones?: Array<{ id: string }>;
  };
  record(
    'list projection milestones (view access)',
    listMilestonesRes.status === 200 &&
      (listMilestonesBody.projectionMilestones?.length ?? 0) >= 2,
    `count=${listMilestonesBody.projectionMilestones?.length ?? 0}`
  );

  if (milestoneId) {
    const updateMilestoneRes = await updateProjectionMilestone(
      await authRequest(
        `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones/${milestoneId}`,
        doctorToken,
        {
          method: 'PUT',
          body: JSON.stringify({
            notes: 'Advisor adjusted',
            cumulativeIncome: 8888,
          }),
        }
      ),
      {
        params: Promise.resolve({
          id: client.id,
          planId,
          milestoneId,
        }),
      }
    );
    const updateMilestoneBody = (await updateMilestoneRes.json()) as {
      projectionMilestone?: { cumulativeIncome: number | null; notes: string | null };
      error?: string;
    };
    record(
      'update projection milestone keeps manual cumulativeIncome',
      updateMilestoneRes.status === 200 &&
        updateMilestoneBody.projectionMilestone?.cumulativeIncome === 8888 &&
        updateMilestoneBody.projectionMilestone?.notes === 'Advisor adjusted',
      updateMilestoneBody.error ??
        `cum=${updateMilestoneBody.projectionMilestone?.cumulativeIncome}`
    );
  } else {
    record('update projection milestone keeps manual cumulativeIncome', false, 'no milestone');
  }

  if (milestoneId && milestoneSecondId) {
    const reorderRes = await reorderProjectionMilestones(
      await authRequest(
        `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones/reorder`,
        doctorToken,
        {
          method: 'PUT',
          body: JSON.stringify({
            orderedIds: [milestoneSecondId, milestoneId],
          }),
        }
      ),
      { params: planParams }
    );
    const reorderBody = (await reorderRes.json()) as {
      projectionMilestones?: Array<{ id: string; sortOrder: number }>;
      error?: string;
    };
    record(
      'reorder projection milestones',
      reorderRes.status === 200 &&
        reorderBody.projectionMilestones?.[0]?.id === milestoneSecondId &&
        reorderBody.projectionMilestones?.[0]?.sortOrder === 0,
      reorderBody.error ?? `status ${reorderRes.status}`
    );
  } else {
    record('reorder projection milestones', false, 'missing milestone ids');
  }

  // --- 5c. Timeline economics fields + milestone source links ---
  const timelineStepRes = await createStep(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/steps`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Timeline investment',
          investmentAmount: 100000,
          startYear: 2026,
          endYear: 2030,
          incomeAmount: 1000,
          incomeFrequency: 'MONTHLY',
          incomeStartYear: 2026,
          incomeEndYear: 2030,
          capitalReturned: 100000,
          capitalReturnYear: 2030,
          plannedAmount: 100000,
        }),
      }
    ),
    { params: planParams }
  );
  const timelineStepBody = (await timelineStepRes.json()) as {
    step?: {
      id: string;
      investmentAmount: number | null;
      incomeAmount: number | null;
      incomeFrequency: string | null;
      incomeStartYear: number | null;
      incomeEndYear: number | null;
      capitalReturned: number | null;
      capitalReturnYear: number | null;
    };
    error?: string;
  };
  const timelineStepId = timelineStepBody.step?.id ?? null;
  record(
    'create step with timeline economics fields',
    timelineStepRes.status === 201 &&
      timelineStepBody.step?.investmentAmount === 100000 &&
      timelineStepBody.step?.incomeAmount === 1000 &&
      timelineStepBody.step?.incomeFrequency === 'MONTHLY' &&
      timelineStepBody.step?.incomeStartYear === 2026 &&
      timelineStepBody.step?.capitalReturnYear === 2030,
    timelineStepBody.error ?? `step=${timelineStepId}`
  );

  if (timelineStepId) {
    const timelineStepUpdateRes = await updateStep(
      await authRequest(
        `/api/clients/${client.id}/strategy-plans/${planId}/steps/${timelineStepId}`,
        doctorToken,
        {
          method: 'PUT',
          body: JSON.stringify({
            capitalReturned: 110000,
            endYear: 2031,
          }),
        }
      ),
      {
        params: Promise.resolve({
          id: client.id,
          planId,
          stepId: timelineStepId,
        }),
      }
    );
    const timelineStepUpdateBody = (await timelineStepUpdateRes.json()) as {
      step?: { capitalReturned: number | null; endYear: number | null };
      error?: string;
    };
    record(
      'update step timeline fields',
      timelineStepUpdateRes.status === 200 &&
        timelineStepUpdateBody.step?.capitalReturned === 110000 &&
        timelineStepUpdateBody.step?.endYear === 2031,
      timelineStepUpdateBody.error ?? 'ok'
    );
  } else {
    record('update step timeline fields', false, 'no timeline step');
  }

  const timelineExpenseRes = await createExpense(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/expenses`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'One-time setup',
          amount: 100000,
          frequency: StrategyExpenseFrequency.ONE_TIME,
          startYear: 2026,
          endYear: 2026,
        }),
      }
    ),
    { params: planParams }
  );
  const timelineExpenseBody = (await timelineExpenseRes.json()) as {
    expense?: {
      id: string;
      startYear: number | null;
      endYear: number | null;
      amount: number | null;
    };
    error?: string;
  };
  const timelineExpenseId = timelineExpenseBody.expense?.id ?? null;
  record(
    'create expense with start/end year',
    timelineExpenseRes.status === 201 &&
      timelineExpenseBody.expense?.startYear === 2026 &&
      timelineExpenseBody.expense?.endYear === 2026 &&
      timelineExpenseBody.expense?.amount === 100000,
    timelineExpenseBody.error ?? `expense=${timelineExpenseId}`
  );

  if (timelineExpenseId) {
    const timelineExpenseUpdateRes = await updateExpense(
      await authRequest(
        `/api/clients/${client.id}/strategy-plans/${planId}/expenses/${timelineExpenseId}`,
        doctorToken,
        {
          method: 'PUT',
          body: JSON.stringify({ endYear: 2027 }),
        }
      ),
      {
        params: Promise.resolve({
          id: client.id,
          planId,
          expenseId: timelineExpenseId,
        }),
      }
    );
    const timelineExpenseUpdateBody = (await timelineExpenseUpdateRes.json()) as {
      expense?: { endYear: number | null };
      error?: string;
    };
    record(
      'update expense start/end year',
      timelineExpenseUpdateRes.status === 200 &&
        timelineExpenseUpdateBody.expense?.endYear === 2027,
      timelineExpenseUpdateBody.error ?? 'ok'
    );
  } else {
    record('update expense start/end year', false, 'no timeline expense');
  }

  let sourceMilestoneId: string | null = null;
  if (timelineStepId && timelineExpenseId) {
    const sourceMilestoneRes = await createProjectionMilestone(
      await authRequest(
        `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones`,
        doctorToken,
        {
          method: 'POST',
          body: JSON.stringify({
            year: 2030,
            title: 'Sources checkpoint',
            type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
            expensesThisYear: 0,
            cumulativeExpenses: 100000,
            netCashflowThisYear: 12000,
            capitalReturnedThisYear: 100000,
            capitalReturnedToDate: 100000,
            selectedStepIds: [timelineStepId],
            selectedExpenseIds: [timelineExpenseId],
          }),
        }
      ),
      { params: planParams }
    );
    const sourceMilestoneBody = (await sourceMilestoneRes.json()) as {
      projectionMilestone?: {
        id: string;
        expensesThisYear: number | null;
        cumulativeExpenses: number | null;
        selectedStepIds: string[];
        selectedExpenseIds: string[];
        selectedSteps: Array<{ stepId: string }>;
        selectedExpenses: Array<{ expenseId: string }>;
      };
      error?: string;
    };
    sourceMilestoneId = sourceMilestoneBody.projectionMilestone?.id ?? null;
    record(
      'create milestone with selected step/expense ids',
      sourceMilestoneRes.status === 201 &&
        sourceMilestoneBody.projectionMilestone?.expensesThisYear === 0 &&
        sourceMilestoneBody.projectionMilestone?.cumulativeExpenses === 100000 &&
        sourceMilestoneBody.projectionMilestone?.selectedStepIds?.includes(
          timelineStepId
        ) &&
        sourceMilestoneBody.projectionMilestone?.selectedExpenseIds?.includes(
          timelineExpenseId
        ) &&
        (sourceMilestoneBody.projectionMilestone?.selectedSteps.length ?? 0) ===
          1,
      sourceMilestoneBody.error ?? `milestone=${sourceMilestoneId}`
    );
  } else {
    record(
      'create milestone with selected step/expense ids',
      false,
      'missing timeline step/expense'
    );
  }

  if (sourceMilestoneId && timelineStepId && dealStepId) {
    const replaceSourcesRes = await updateProjectionMilestone(
      await authRequest(
        `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones/${sourceMilestoneId}`,
        doctorToken,
        {
          method: 'PUT',
          body: JSON.stringify({
            sourceStepIds: [dealStepId],
            sourceExpenseIds: [],
          }),
        }
      ),
      {
        params: Promise.resolve({
          id: client.id,
          planId,
          milestoneId: sourceMilestoneId,
        }),
      }
    );
    const replaceSourcesBody = (await replaceSourcesRes.json()) as {
      projectionMilestone?: {
        selectedStepIds: string[];
        selectedExpenseIds: string[];
      };
      error?: string;
    };
    record(
      'update milestone replaces/clears selected source ids',
      replaceSourcesRes.status === 200 &&
        replaceSourcesBody.projectionMilestone?.selectedStepIds?.length === 1 &&
        replaceSourcesBody.projectionMilestone?.selectedStepIds[0] ===
          dealStepId &&
        replaceSourcesBody.projectionMilestone?.selectedExpenseIds?.length === 0,
      replaceSourcesBody.error ??
        `steps=${replaceSourcesBody.projectionMilestone?.selectedStepIds?.join(',')}`
    );

    const preserveSourcesRes = await updateProjectionMilestone(
      await authRequest(
        `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones/${sourceMilestoneId}`,
        doctorToken,
        {
          method: 'PUT',
          body: JSON.stringify({ notes: 'preserve sources' }),
        }
      ),
      {
        params: Promise.resolve({
          id: client.id,
          planId,
          milestoneId: sourceMilestoneId,
        }),
      }
    );
    const preserveSourcesBody = (await preserveSourcesRes.json()) as {
      projectionMilestone?: {
        notes: string | null;
        selectedStepIds: string[];
      };
      error?: string;
    };
    record(
      'update milestone without source ids preserves links',
      preserveSourcesRes.status === 200 &&
        preserveSourcesBody.projectionMilestone?.notes === 'preserve sources' &&
        preserveSourcesBody.projectionMilestone?.selectedStepIds?.[0] ===
          dealStepId,
      preserveSourcesBody.error ?? 'ok'
    );
  } else {
    record(
      'update milestone replaces/clears selected source ids',
      false,
      'no source milestone'
    );
    record(
      'update milestone without source ids preserves links',
      false,
      'no source milestone'
    );
  }

  const badSourceStepRes = await createProjectionMilestone(
    await authRequest(
      `/api/clients/${client.id}/strategy-plans/${planId}/projection-milestones`,
      doctorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          year: 2032,
          title: 'Bad sources',
          type: StrategyProjectionMilestoneType.CUSTOM,
          selectedStepIds: [otherPlanStepId],
        }),
      }
    ),
    { params: planParams }
  );
  record(
    'milestone rejects selectedStepIds from another plan',
    badSourceStepRes.status === 400,
    `status ${badSourceStepRes.status}`
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
        investmentAmount?: number | null;
        linkedDeal?: { id: string; name: string } | null;
      }>;
      connections: Array<{ id: string }>;
      expenses: Array<{
        id: string;
        startYear?: number | null;
        coveredByStep?: { id: string } | null;
      }>;
      projectionMilestones: Array<{
        id: string;
        selectedStepIds?: string[];
        selectedExpenseIds?: string[];
        selectedSteps?: Array<{ stepId: string }>;
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
    'fetch plan includes projection milestones',
    Boolean(
      fetched?.projectionMilestones?.some((m) => m.id === milestoneId)
    ),
    `milestones=${fetched?.projectionMilestones?.length ?? 0}`
  );
  record(
    'fetch plan includes timeline step fields',
    Boolean(
      timelineStepId &&
        fetched?.steps.some(
          (step) =>
            step.id === timelineStepId && step.investmentAmount === 100000
        )
    ),
    'missing timeline step fields'
  );
  record(
    'fetch plan includes expense year fields',
    Boolean(
      timelineExpenseId &&
        fetched?.expenses.some(
          (expense) =>
            expense.id === timelineExpenseId && expense.startYear === 2026
        )
    ),
    'missing expense years'
  );
  record(
    'fetch plan includes milestone selected source links',
    Boolean(
      sourceMilestoneId &&
        fetched?.projectionMilestones?.some(
          (m) =>
            m.id === sourceMilestoneId &&
            (m.selectedStepIds?.length ?? 0) === 1 &&
            (m.selectedSteps?.length ?? 0) === 1
        )
    ),
    'missing selected sources on detail'
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
