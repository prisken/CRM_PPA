import { AssignmentRole, DealStatus } from '@prisma/client';
import { COMMISSION_RATE_POOLS } from '@/lib/constants';
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

  let userCredit = 0;
  const userRoles = allAssignmentsForClient
    .filter((assignment) => assignment.userId === doctorUserId)
    .map((assignment) => assignment.role);

  if (userRoles.includes(AssignmentRole.RELATIONSHIP)) {
    const relationshipOccupancy = allAssignmentsForClient.filter(
      (assignment) => assignment.role === AssignmentRole.RELATIONSHIP
    ).length;

    if (relationshipOccupancy > 0) {
      userCredit +=
        totalCommission *
        (COMMISSION_RATE_POOLS.RELATIONSHIP / relationshipOccupancy);
    }
  }

  if (userRoles.includes(AssignmentRole.ACCOUNT_SERVICE)) {
    const accountServiceOccupancy = allAssignmentsForClient.filter(
      (assignment) => assignment.role === AssignmentRole.ACCOUNT_SERVICE
    ).length;

    if (accountServiceOccupancy > 0) {
      userCredit +=
        totalCommission *
        (COMMISSION_RATE_POOLS.ACCOUNT_SERVICE / accountServiceOccupancy);
    }
  }

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

export async function createCommissionReturnablesForWonDeal({
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

  const returnables = await Promise.all(
    doctorAssignments.map((assignment) => {
      const returnableAmount = calculateDoctorCommissionReturnableAmount(
        totalCommission,
        doctorCount,
        assignment.userId,
        allAssignmentsForClient
      );

      return prisma.commissionReturnable.create({
        data: {
          amount: returnableAmount,
          status: 'UNPAID',
          period,
          userId: assignment.userId,
          dealId,
        },
      });
    })
  );

  return returnables;
}

export type CommissionReturnableRecalculationChange = {
  id: string;
  dealName: string;
  userEmail: string;
  previousAmount: number;
  correctedAmount: number;
  action: 'updated' | 'created';
};

export async function backfillCommissionReturnablesForWonDeals() {
  const wonDeals = await prisma.deal.findMany({
    where: { status: DealStatus.WON },
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
    include: {
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
        include: {
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
