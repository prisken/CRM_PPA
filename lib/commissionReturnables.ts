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

  const doctorAssignments = await prisma.clientAssignment.findMany({
    where: {
      clientId,
      role: AssignmentRole.DOCTOR,
    },
    select: { userId: true },
  });

  const doctorCount = doctorAssignments.length;
  if (doctorCount === 0) {
    return [];
  }

  const individualShare = COMMISSION_RATE_POOLS.DOCTOR / doctorCount;

  const returnables = await Promise.all(
    doctorAssignments.map((assignment) =>
      prisma.commissionReturnable.create({
        data: {
          amount: totalCommission * (1 - individualShare),
          status: 'UNPAID',
          period,
          userId: assignment.userId,
          dealId,
        },
      })
    )
  );

  return returnables;
}

export async function backfillCommissionReturnablesForWonDeals() {
  const wonDeals = await prisma.deal.findMany({
    where: { status: DealStatus.WON },
    select: {
      id: true,
      clientId: true,
      totalCommission: true,
      updatedAt: true,
    },
  });

  let createdForDeals = 0;

  for (const deal of wonDeals) {
    const created = await createCommissionReturnablesForWonDeal({
      dealId: deal.id,
      clientId: deal.clientId,
      totalCommission: Number(deal.totalCommission),
      period: new Date(
        deal.updatedAt.getFullYear(),
        deal.updatedAt.getMonth(),
        1
      ),
    });

    if (created.length > 0) {
      createdForDeals += 1;
    }
  }

  return {
    wonDealsProcessed: wonDeals.length,
    dealsBackfilled: createdForDeals,
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
