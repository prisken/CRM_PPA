import { AssignmentRole, DealParticipantRole, DealStatus } from '@prisma/client';
import { calculateIndividualRoleShare } from '@/lib/commissionCalculations';
import { COMMISSION_RATE_POOLS } from '@/lib/constants';
import {
  calculateParticipantReturnableAmount,
} from '@/lib/dealParticipantCalculations';
import { prisma } from '@/lib/prisma';

type CreateCommissionReturnablesInput = {
  dealId: string;
  clientId: string;
  totalCommission: number;
  period?: Date;
};

export function getCurrentCommissionReturnablePeriod() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

type ClientAssignmentForReturnable = {
  userId: string;
  role: AssignmentRole;
};

function buildAssignmentRoleOccupancy(
  assignments: ClientAssignmentForReturnable[]
) {
  const occupancy = new Map<AssignmentRole, number>();

  for (const assignment of assignments) {
    occupancy.set(
      assignment.role,
      (occupancy.get(assignment.role) ?? 0) + 1
    );
  }

  return occupancy;
}

export function calculateDoctorCommissionReturnableAmount(
  totalCommission: number,
  doctorCount: number,
  doctorUserId: string,
  allAssignmentsForClient: ClientAssignmentForReturnable[]
) {
  if (doctorCount <= 0) {
    return 0;
  }

  const doctorPoolRate = COMMISSION_RATE_POOLS.DOCTOR;
  const doctorPortionOfCommission = totalCommission / doctorCount;
  const baseLiability = doctorPortionOfCommission * (1 - doctorPoolRate);

  const roleOccupancy = buildAssignmentRoleOccupancy(allAssignmentsForClient);

  const userNonDoctorAssignments = allAssignmentsForClient.filter(
    (assignment) =>
      assignment.userId === doctorUserId &&
      (assignment.role === AssignmentRole.RELATIONSHIP ||
        assignment.role === AssignmentRole.ACCOUNT_SERVICE)
  );

  const userCredit = userNonDoctorAssignments.reduce((totalCredit, assignment) => {
    const occupancy = roleOccupancy.get(assignment.role) ?? 0;

    if (occupancy <= 0) {
      return totalCredit;
    }

    const creditForThisRole =
      totalCommission * calculateIndividualRoleShare(assignment.role, occupancy);

    return totalCredit + creditForThisRole;
  }, 0);

  return Math.max(0, baseLiability - userCredit);
}

export async function getDoctorCountForClient(clientId: string) {
  return prisma.clientAssignment.count({
    where: {
      clientId,
      role: AssignmentRole.DOCTOR,
    },
  });
}

export type GenerateCommissionReturnablesResult = {
  created: number;
  updated: number;
  skipped: number;
  zeroed: number;
  paidPreserved: number;
  warnings: string[];
};

/**
 * Generate or update commission returnables from explicit DealParticipant returnable fields.
 * Only DOCTOR participants with isReturnableRequired generate returnables.
 */
export async function generateCommissionReturnablesForDealParticipants(
  dealId: string,
  period = getCurrentCommissionReturnablePeriod()
): Promise<GenerateCommissionReturnablesResult> {
  const result: GenerateCommissionReturnablesResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    zeroed: 0,
    paidPreserved: 0,
    warnings: [],
  };

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      status: true,
      totalCommission: true,
      participants: {
        select: {
          id: true,
          userId: true,
          role: true,
          commissionPercent: true,
          commissionAmount: true,
          isCommissionable: true,
          returnablePercent: true,
          returnableAmount: true,
          isReturnableRequired: true,
        },
      },
    },
  });

  if (!deal || deal.status !== DealStatus.WON) {
    return result;
  }

  const totalCommission = Number(deal.totalCommission);
  const targetAmountByUserId = new Map<string, number>();

  for (const participant of deal.participants) {
    if (participant.role !== DealParticipantRole.DOCTOR) {
      continue;
    }

    if (!participant.isReturnableRequired) {
      result.skipped += 1;
      continue;
    }

    if (!participant.userId) {
      result.warnings.push(
        `Skipped doctor participant ${participant.id}: returnable required but userId is missing.`
      );
      continue;
    }

    if (!participant.isCommissionable) {
      result.warnings.push(
        `Skipped doctor participant ${participant.id}: returnable required but participant is not commissionable.`
      );
      continue;
    }

    const amount = calculateParticipantReturnableAmount(totalCommission, participant);

    if (amount === null) {
      result.warnings.push(
        `Skipped doctor participant ${participant.id} (${participant.userId}): missing returnable amount/percent.`
      );
      continue;
    }

    targetAmountByUserId.set(participant.userId, amount);
  }

  const existingReturnables = await prisma.commissionReturnable.findMany({
    where: { dealId },
  });

  const existingByUserId = new Map(
    existingReturnables.map((record) => [record.userId, record])
  );

  for (const [userId, amount] of targetAmountByUserId.entries()) {
    const existing = existingByUserId.get(userId);

    if (!existing) {
      await prisma.commissionReturnable.create({
        data: {
          amount,
          status: 'UNPAID',
          period,
          userId,
          dealId,
        },
      });
      result.created += 1;
      continue;
    }

    if (existing.status === 'PAID') {
      result.paidPreserved += 1;
      continue;
    }

    const previousAmount = Number(existing.amount);
    if (Math.abs(previousAmount - amount) > 0.005) {
      await prisma.commissionReturnable.update({
        where: { id: existing.id },
        data: { amount },
      });
      result.updated += 1;
    }
  }

  for (const existing of existingReturnables) {
    if (targetAmountByUserId.has(existing.userId)) {
      continue;
    }

    if (existing.status === 'PAID') {
      result.paidPreserved += 1;
      continue;
    }

    const previousAmount = Number(existing.amount);
    if (Math.abs(previousAmount) > 0.005) {
      await prisma.commissionReturnable.update({
        where: { id: existing.id },
        data: { amount: 0 },
      });
      result.zeroed += 1;
    }
  }

  return result;
}

async function createLegacyCommissionReturnablesForWonDeal({
  dealId,
  clientId,
  totalCommission,
  period = getCurrentCommissionReturnablePeriod(),
}: CreateCommissionReturnablesInput) {
  const existingCount = await prisma.commissionReturnable.count({
    where: { dealId },
  });

  if (existingCount > 0) {
    return [];
  }

  const allAssignmentsForClient = await prisma.clientAssignment.findMany({
    where: { clientId },
    select: { userId: true, role: true },
  });

  const doctorAssignments = allAssignmentsForClient.filter(
    (assignment) => assignment.role === AssignmentRole.DOCTOR
  );
  const doctorCount = doctorAssignments.length;
  if (doctorCount === 0) {
    return [];
  }

  const returnableRows = doctorAssignments.map((assignment) => ({
    amount: calculateDoctorCommissionReturnableAmount(
      totalCommission,
      doctorCount,
      assignment.userId,
      allAssignmentsForClient
    ),
    status: 'UNPAID' as const,
    period,
    userId: assignment.userId,
    dealId,
  }));

  await prisma.commissionReturnable.createMany({
    data: returnableRows,
  });

  return prisma.commissionReturnable.findMany({
    where: { dealId },
  });
}

export async function createCommissionReturnablesForWonDeal({
  dealId,
  clientId,
  totalCommission,
  period = getCurrentCommissionReturnablePeriod(),
}: CreateCommissionReturnablesInput) {
  const participantCount = await prisma.dealParticipant.count({
    where: { dealId },
  });

  if (participantCount > 0) {
    await generateCommissionReturnablesForDealParticipants(dealId, period);
    return prisma.commissionReturnable.findMany({
      where: { dealId },
    });
  }

  return createLegacyCommissionReturnablesForWonDeal({
    dealId,
    clientId,
    totalCommission,
    period,
  });
}

/**
 * Recalculates and updates all commission returnable amounts for a specific user on a specific client.
 * Trigger when a user's assignments change for a client.
 */
export async function recalculateReturnablesForUserOnClient(
  userId: string,
  clientId: string
) {
  const wonDeals = await prisma.deal.findMany({
    where: {
      clientId,
      status: DealStatus.WON,
    },
    select: {
      id: true,
      totalCommission: true,
    },
  });

  if (wonDeals.length === 0) {
    return;
  }

  const allAssignmentsForClient = await prisma.clientAssignment.findMany({
    where: { clientId },
    select: { userId: true, role: true },
  });

  const isUserStillDoctor = allAssignmentsForClient.some(
    (assignment) =>
      assignment.userId === userId && assignment.role === AssignmentRole.DOCTOR
  );

  const doctorCount = allAssignmentsForClient.filter(
    (assignment) => assignment.role === AssignmentRole.DOCTOR
  ).length;

  const dealIds = wonDeals.map((deal) => deal.id);

  const existingReturnables = await prisma.commissionReturnable.findMany({
    where: {
      userId,
      dealId: { in: dealIds },
    },
    select: {
      id: true,
      dealId: true,
      amount: true,
    },
  });

  const returnableByDealId = new Map(
    existingReturnables.map((record) => [record.dealId, record])
  );

  const updates: { id: string; amount: number }[] = [];

  for (const deal of wonDeals) {
    const existingReturnable = returnableByDealId.get(deal.id);

    if (!existingReturnable) {
      continue;
    }

    const newAmount = isUserStillDoctor
      ? calculateDoctorCommissionReturnableAmount(
          Number(deal.totalCommission),
          doctorCount,
          userId,
          allAssignmentsForClient
        )
      : 0;

    const previousAmount = Number(existingReturnable.amount);

    if (Math.abs(previousAmount - newAmount) > 0.005) {
      updates.push({ id: existingReturnable.id, amount: newAmount });
    }
  }

  if (updates.length > 0) {
    await Promise.all(
      updates.map((update) =>
        prisma.commissionReturnable.update({
          where: { id: update.id },
          data: { amount: update.amount },
        })
      )
    );
  }
}

/**
 * Schedules durable returnable recalculation for (userId, clientId).
 * Enqueues a BackgroundJob (deduped while PENDING), then best-effort processes
 * a small batch in-process so assignment APIs can still return immediately.
 */
export function scheduleReturnableRecalculation(
  userId: string,
  clientId: string,
  _request?: Request
) {
  void (async () => {
    const {
      BACKGROUND_JOB_TYPES,
      enqueueReturnableRecalculationJob,
      processBackgroundJobs,
    } = await import('@/lib/backgroundJobs');
    await enqueueReturnableRecalculationJob(userId, clientId);
    await processBackgroundJobs({
      limit: 5,
      types: [BACKGROUND_JOB_TYPES.RECALCULATE_RETURNABLES_FOR_USER_CLIENT],
    });
  })().catch((error) => {
    console.error(
      `Failed to schedule returnable recalculation for user ${userId} on client ${clientId}.`,
      error
    );
  });
}

export type CommissionReturnableRecalculationChange = {
  id: string;
  dealName: string;
  userEmail: string;
  previousAmount: number;
  correctedAmount: number;
  action: 'updated' | 'created';
};

export type CommissionReturnableRecalculationSummary = {
  wonDealsProcessed: number;
  dealsWithParticipants: number;
  dealsWithLegacyFallback: number;
  participantReturnablesCreated: number;
  participantReturnablesUpdated: number;
  participantReturnablesSkippedNotRequired: number;
  participantReturnablesSkippedInvalid: number;
  paidRecordsPreserved: number;
  unpaidRecordsZeroed: number;
  legacyRecordsUpdated: number;
  legacyRecordsCreated: number;
  changes: CommissionReturnableRecalculationChange[];
};

export async function recalculateAllCommissionReturnablesForWonDeals(): Promise<CommissionReturnableRecalculationSummary> {
  const wonDeals = await prisma.deal.findMany({
    where: { status: DealStatus.WON },
    select: {
      id: true,
      name: true,
      clientId: true,
      totalCommission: true,
      _count: {
        select: { participants: true },
      },
    },
  });

  const summary: CommissionReturnableRecalculationSummary = {
    wonDealsProcessed: wonDeals.length,
    dealsWithParticipants: 0,
    dealsWithLegacyFallback: 0,
    participantReturnablesCreated: 0,
    participantReturnablesUpdated: 0,
    participantReturnablesSkippedNotRequired: 0,
    participantReturnablesSkippedInvalid: 0,
    paidRecordsPreserved: 0,
    unpaidRecordsZeroed: 0,
    legacyRecordsUpdated: 0,
    legacyRecordsCreated: 0,
    changes: [],
  };

  for (const deal of wonDeals) {
    if (deal._count.participants > 0) {
      summary.dealsWithParticipants += 1;
      const result = await generateCommissionReturnablesForDealParticipants(deal.id);
      summary.participantReturnablesCreated += result.created;
      summary.participantReturnablesUpdated += result.updated;
      summary.participantReturnablesSkippedNotRequired += result.skipped;
      summary.participantReturnablesSkippedInvalid += result.warnings.length;
      summary.paidRecordsPreserved += result.paidPreserved;
      summary.unpaidRecordsZeroed += result.zeroed;
      continue;
    }

    summary.dealsWithLegacyFallback += 1;
    const legacyResult = await backfillCommissionReturnablesForWonDeals({
      dealIds: [deal.id],
    });
    summary.legacyRecordsUpdated += legacyResult.recordsUpdated;
    summary.legacyRecordsCreated += legacyResult.recordsCreated;
    summary.changes.push(...legacyResult.changes);
  }

  return summary;
}

export async function backfillCommissionReturnablesForWonDeals(options?: {
  dealIds?: string[];
}) {
  const wonDeals = await prisma.deal.findMany({
    where: {
      status: DealStatus.WON,
      ...(options?.dealIds ? { id: { in: options.dealIds } } : {}),
      participants: { none: {} },
    },
    select: {
      id: true,
      name: true,
      clientId: true,
      totalCommission: true,
    },
  });

  const clientIds = [...new Set(wonDeals.map((deal) => deal.clientId))];
  const assignmentRows =
    clientIds.length > 0
      ? await prisma.clientAssignment.findMany({
          where: { clientId: { in: clientIds } },
          select: { clientId: true, userId: true, role: true },
        })
      : [];

  const assignmentsByClientId = new Map<string, ClientAssignmentForReturnable[]>();
  for (const row of assignmentRows) {
    const existing = assignmentsByClientId.get(row.clientId) ?? [];
    existing.push({ userId: row.userId, role: row.role });
    assignmentsByClientId.set(row.clientId, existing);
  }

  const existingReturnables = await prisma.commissionReturnable.findMany({
    where: options?.dealIds ? { dealId: { in: options.dealIds } } : undefined,
    select: {
      id: true,
      amount: true,
      dealId: true,
      userId: true,
      user: { select: { email: true } },
      deal: {
        select: {
          id: true,
          name: true,
          clientId: true,
          totalCommission: true,
          status: true,
        },
      },
    },
  });

  const returnableByDealUser = new Map(
    existingReturnables.map((record) => [`${record.dealId}:${record.userId}`, record])
  );

  const changes: CommissionReturnableRecalculationChange[] = [];
  let updatedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  for (const deal of wonDeals) {
    const allAssignmentsForClient = assignmentsByClientId.get(deal.clientId) ?? [];
    const doctorAssignments = allAssignmentsForClient.filter(
      (assignment) => assignment.role === AssignmentRole.DOCTOR
    );
    const doctorCount = doctorAssignments.length;

    if (doctorCount === 0) {
      continue;
    }

    const totalCommission = Number(deal.totalCommission);

    for (const doctor of doctorAssignments) {
      const correctedAmount = calculateDoctorCommissionReturnableAmount(
        totalCommission,
        doctorCount,
        doctor.userId,
        allAssignmentsForClient
      );
      const lookupKey = `${deal.id}:${doctor.userId}`;
      const existing = returnableByDealUser.get(lookupKey);

      if (existing) {
        const previousAmount = Number(existing.amount);

        if (Math.abs(previousAmount - correctedAmount) > 0.005) {
          await prisma.commissionReturnable.update({
            where: { id: existing.id },
            data: { amount: correctedAmount },
          });

          changes.push({
            id: existing.id,
            dealName: deal.name,
            userEmail: existing.user.email,
            previousAmount,
            correctedAmount,
            action: 'updated',
          });
          updatedCount += 1;
        }

        continue;
      }

      const created = await prisma.commissionReturnable.create({
        data: {
          amount: correctedAmount,
          status: 'UNPAID',
          period: getCurrentCommissionReturnablePeriod(),
          userId: doctor.userId,
          dealId: deal.id,
        },
        select: {
          id: true,
          user: { select: { email: true } },
        },
      });

      changes.push({
        id: created.id,
        dealName: deal.name,
        userEmail: created.user.email,
        previousAmount: 0,
        correctedAmount,
        action: 'created',
      });
      createdCount += 1;
    }
  }

  for (const record of existingReturnables) {
    if (!record.deal || record.deal.status !== DealStatus.WON) {
      skippedCount += 1;
    }
  }

  return {
    wonDealsProcessed: wonDeals.length,
    recordsProcessed: existingReturnables.length,
    recordsUpdated: updatedCount,
    recordsCreated: createdCount,
    recordsSkipped: skippedCount,
    changes,
  };
}

export function formatCommissionReturnable(
  record: {
    id: string;
    amount: { toString(): string };
    status: string;
    period: Date;
    userId: string;
    dealId: string;
    createdAt: Date;
    updatedAt: Date;
  },
  relations?: {
    user?: { id: string; name: string | null; email: string } | null;
    deal?: {
      id: string;
      name: string;
      clientId: string;
      dealValue?: { toString(): string };
      totalCommission?: { toString(): string };
      client?: {
        id: string;
        name: string;
        company: string | null;
      } | null;
    } | null;
  }
) {
  return {
    id: record.id,
    amount: Number(record.amount),
    status: record.status,
    period: record.period.toISOString(),
    userId: record.userId,
    dealId: record.dealId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(relations?.user
      ? {
          user: {
            id: relations.user.id,
            name: relations.user.name,
            email: relations.user.email,
          },
        }
      : {}),
    ...(relations?.deal
      ? {
          deal: {
            id: relations.deal.id,
            name: relations.deal.name,
            clientId: relations.deal.clientId,
            ...(relations.deal.dealValue !== undefined
              ? { dealValue: Number(relations.deal.dealValue) }
              : {}),
            ...(relations.deal.totalCommission !== undefined
              ? { totalCommission: Number(relations.deal.totalCommission) }
              : {}),
            ...(relations.deal.client
              ? {
                  client: {
                    id: relations.deal.client.id,
                    name: relations.deal.client.name,
                    company: relations.deal.client.company,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

export function parseCommissionReturnableStatusFilter(
  status: string | null
): string | undefined | null {
  if (!status) {
    return undefined;
  }

  const normalized = status.trim().toUpperCase();
  if (normalized !== 'UNPAID' && normalized !== 'PAID') {
    return null;
  }

  return normalized;
}

export function getCurrentCommissionReturnablePeriodParam() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

export function formatCommissionReturnablePeriodLabel(period: string) {
  const date = new Date(period);
  return date.toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function parseCommissionReturnablePeriodFilter(
  period: string | null
): Date | null | undefined {
  if (!period) {
    return undefined;
  }

  const trimmed = period.trim();

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [year, month] = trimmed.split('-').map(Number);
    if (month < 1 || month > 12) {
      return null;
    }

    return new Date(year, month - 1, 1);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}
