import {
  AssignmentRole,
  DealParticipantRole,
  Prisma,
} from '@prisma/client';
import {
  COMMISSION_RATE_POOLS,
  COMPANY_OVERHEAD_RATE,
} from '@/lib/constants';
import { calculateParticipantAmount } from '@/lib/dealCommissionTemplates';
import { prisma } from '@/lib/prisma';

const COMPANY_EXTERNAL_NAME = 'Profit Pulse Ally';

const COMPANY_POOL_PERCENT = COMPANY_OVERHEAD_RATE * 100;
const RELATIONSHIP_POOL_PERCENT = COMMISSION_RATE_POOLS.RELATIONSHIP * 100;
const FOLLOW_UP_POOL_PERCENT = COMMISSION_RATE_POOLS.ACCOUNT_SERVICE * 100;
const DOCTOR_POOL_PERCENT = COMMISSION_RATE_POOLS.DOCTOR * 100;

type ClientAssignmentRow = {
  userId: string;
  role: AssignmentRole;
};

export type DealParticipantsBackfillSummary = {
  scannedDeals: number;
  skippedDealsWithParticipants: number;
  updatedDeals: number;
  createdParticipants: number;
  warnings: string[];
};

export type DealParticipantsBackfillOptions = {
  dryRun?: boolean;
  limit?: number;
};

type ParticipantDraft = {
  userId: string | null;
  externalName: string | null;
  role: DealParticipantRole;
  commissionPercent: number;
  commissionAmount: number;
  isCommissionable: boolean;
  returnablePercent: number | null;
  returnableAmount: number | null;
  isReturnableRequired: boolean;
};

function splitPoolPercentEvenly(poolPercent: number, count: number) {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, () =>
    Math.round((poolPercent / count) * 100) / 100
  );
}

function buildParticipantsForDeal(
  totalCommission: number,
  assignments: ClientAssignmentRow[]
): { participants: ParticipantDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  const participants: ParticipantDraft[] = [];

  participants.push({
    userId: null,
    externalName: COMPANY_EXTERNAL_NAME,
    role: DealParticipantRole.COMPANY,
    commissionPercent: COMPANY_POOL_PERCENT,
    commissionAmount: calculateParticipantAmount(
      totalCommission,
      COMPANY_POOL_PERCENT
    ),
    isCommissionable: true,
    returnablePercent: null,
    returnableAmount: null,
    isReturnableRequired: false,
  });

  const relationshipAssignments = assignments.filter(
    (assignment) => assignment.role === AssignmentRole.RELATIONSHIP
  );
  if (relationshipAssignments.length > 1) {
    warnings.push(
      `Multiple relationship assignments (${relationshipAssignments.length}); splitting ${RELATIONSHIP_POOL_PERCENT}% evenly.`
    );
  }
  const relationshipPercents = splitPoolPercentEvenly(
    RELATIONSHIP_POOL_PERCENT,
    relationshipAssignments.length
  );
  for (let index = 0; index < relationshipAssignments.length; index++) {
    const assignment = relationshipAssignments[index];
    const percent = relationshipPercents[index];

    participants.push({
      userId: assignment.userId,
      externalName: null,
      role: DealParticipantRole.RELATIONSHIP,
      commissionPercent: percent,
      commissionAmount: calculateParticipantAmount(totalCommission, percent),
      isCommissionable: true,
      returnablePercent: null,
      returnableAmount: null,
      isReturnableRequired: false,
    });
  }

  const followUpAssignments = assignments.filter(
    (assignment) => assignment.role === AssignmentRole.ACCOUNT_SERVICE
  );
  if (followUpAssignments.length > 1) {
    warnings.push(
      `Multiple follow-up assignments (${followUpAssignments.length}); splitting ${FOLLOW_UP_POOL_PERCENT}% evenly.`
    );
  }
  const followUpPercents = splitPoolPercentEvenly(
    FOLLOW_UP_POOL_PERCENT,
    followUpAssignments.length
  );
  for (let index = 0; index < followUpAssignments.length; index++) {
    const assignment = followUpAssignments[index];
    const percent = followUpPercents[index];

    participants.push({
      userId: assignment.userId,
      externalName: null,
      role: DealParticipantRole.FOLLOW_UP,
      commissionPercent: percent,
      commissionAmount: calculateParticipantAmount(totalCommission, percent),
      isCommissionable: true,
      returnablePercent: null,
      returnableAmount: null,
      isReturnableRequired: false,
    });
  }

  const doctorAssignments = assignments.filter(
    (assignment) => assignment.role === AssignmentRole.DOCTOR
  );
  if (doctorAssignments.length === 0) {
    warnings.push(
      `No doctor assignments; doctor pool (${DOCTOR_POOL_PERCENT}%) not allocated.`
    );
  } else if (doctorAssignments.length > 1) {
    warnings.push(
      `Multiple doctor assignments (${doctorAssignments.length}); splitting ${DOCTOR_POOL_PERCENT}% evenly.`
    );
  }
  const doctorPercents = splitPoolPercentEvenly(
    DOCTOR_POOL_PERCENT,
    doctorAssignments.length
  );
  for (let index = 0; index < doctorAssignments.length; index++) {
    const assignment = doctorAssignments[index];
    const percent = doctorPercents[index];

    participants.push({
      userId: assignment.userId,
      externalName: null,
      role: DealParticipantRole.DOCTOR,
      commissionPercent: percent,
      commissionAmount: calculateParticipantAmount(totalCommission, percent),
      isCommissionable: true,
      returnablePercent: null,
      returnableAmount: null,
      isReturnableRequired: false,
    });
  }

  const totalPercent = participants.reduce(
    (sum, participant) => sum + participant.commissionPercent,
    0
  );
  const roundedTotal = Math.round(totalPercent * 100) / 100;
  if (Math.abs(roundedTotal - 100) > 0.01) {
    warnings.push(
      `Participant percentages total ${roundedTotal}% (expected 100%).`
    );
  }

  return { participants, warnings };
}

function toCreateManyInput(
  dealId: string,
  participants: ParticipantDraft[]
): Prisma.DealParticipantCreateManyInput[] {
  return participants.map((participant) => ({
    dealId,
    userId: participant.userId,
    externalName: participant.externalName,
    role: participant.role,
    commissionPercent: participant.commissionPercent,
    commissionAmount: participant.commissionAmount,
    isCommissionable: participant.isCommissionable,
    returnablePercent: participant.returnablePercent,
    returnableAmount: participant.returnableAmount,
    isReturnableRequired: participant.isReturnableRequired,
  }));
}

export async function backfillDealParticipantsForExistingDeals(
  options: DealParticipantsBackfillOptions = {}
): Promise<DealParticipantsBackfillSummary> {
  const dryRun = options.dryRun ?? false;
  const warnings: string[] = [
    'Doctor returnable fields were not inferred. Configure doctor returnables per deal.',
  ];

  const [skippedDealsWithParticipants, candidateDeals] = await Promise.all([
    prisma.deal.count({
      where: { participants: { some: {} } },
    }),
    prisma.deal.findMany({
      where: { participants: { none: {} } },
      select: {
        id: true,
        name: true,
        clientId: true,
        totalCommission: true,
      },
      orderBy: { createdAt: 'asc' },
      ...(options.limit !== undefined ? { take: options.limit } : {}),
    }),
  ]);

  const scannedDeals = candidateDeals.length;
  if (scannedDeals === 0) {
    return {
      scannedDeals: 0,
      skippedDealsWithParticipants,
      updatedDeals: 0,
      createdParticipants: 0,
      warnings,
    };
  }

  const clientIds = [...new Set(candidateDeals.map((deal) => deal.clientId))];
  const assignmentRows = await prisma.clientAssignment.findMany({
    where: { clientId: { in: clientIds } },
    select: { clientId: true, userId: true, role: true },
  });

  const assignmentsByClientId = new Map<string, ClientAssignmentRow[]>();
  for (const row of assignmentRows) {
    const existing = assignmentsByClientId.get(row.clientId) ?? [];
    existing.push({ userId: row.userId, role: row.role });
    assignmentsByClientId.set(row.clientId, existing);
  }

  let updatedDeals = 0;
  let createdParticipants = 0;

  for (const deal of candidateDeals) {
    const totalCommission = Number(deal.totalCommission);
    const clientAssignments = assignmentsByClientId.get(deal.clientId) ?? [];
    const { participants, warnings: dealWarnings } = buildParticipantsForDeal(
      totalCommission,
      clientAssignments
    );

    for (const message of dealWarnings) {
      warnings.push(`Deal ${deal.id} (${deal.name}): ${message}`);
    }

    if (participants.length === 0) {
      continue;
    }

    if (dryRun) {
      updatedDeals += 1;
      createdParticipants += participants.length;
      continue;
    }

    const createdCount = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.dealParticipant.count({
        where: { dealId: deal.id },
      });

      if (existingCount > 0) {
        return 0;
      }

      const result = await tx.dealParticipant.createMany({
        data: toCreateManyInput(deal.id, participants),
      });

      return result.count;
    });

    if (createdCount > 0) {
      updatedDeals += 1;
      createdParticipants += createdCount;
    }
  }

  return {
    scannedDeals,
    skippedDealsWithParticipants,
    updatedDeals,
    createdParticipants,
    warnings,
  };
}
