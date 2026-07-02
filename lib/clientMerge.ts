import {
  ActivityLogType,
  AssignmentRole,
  Client,
  ClientStatus,
  LeadSourceType,
  Prisma,
} from '@prisma/client';
import { recalculateReturnablesForUserOnClient } from '@/lib/commissionReturnables';
import { ROLE_OCCUPANCY_LIMITS } from '@/lib/constants';
import { prisma } from '@/lib/prisma';

export type MergeFieldChoiceKey =
  | 'name'
  | 'company'
  | 'email'
  | 'phone'
  | 'lead_source'
  | 'role_in_company'
  | 'employee_count'
  | 'expectations'
  | 'contactInfo';

export type MergeFieldWinner = 'canonical' | 'duplicate';

export type MergeFieldChoices = Partial<
  Record<MergeFieldChoiceKey, MergeFieldWinner>
>;

export type MergeClientsInput = {
  canonicalClientId: string;
  duplicateClientId: string;
  mergedByUserId: string;
  fieldChoices?: MergeFieldChoices;
  reason?: string;
};

type MergeableScalarField = {
  choiceKey: MergeFieldChoiceKey;
  prismaKey: keyof Pick<
    Client,
    | 'name'
    | 'company'
    | 'email'
    | 'phone'
    | 'leadSource'
    | 'roleInCompany'
    | 'employeeCount'
    | 'expectations'
    | 'contactInfo'
  >;
};

const MERGEABLE_SCALAR_FIELDS: MergeableScalarField[] = [
  { choiceKey: 'name', prismaKey: 'name' },
  { choiceKey: 'company', prismaKey: 'company' },
  { choiceKey: 'email', prismaKey: 'email' },
  { choiceKey: 'phone', prismaKey: 'phone' },
  { choiceKey: 'lead_source', prismaKey: 'leadSource' },
  { choiceKey: 'role_in_company', prismaKey: 'roleInCompany' },
  { choiceKey: 'employee_count', prismaKey: 'employeeCount' },
  { choiceKey: 'expectations', prismaKey: 'expectations' },
  { choiceKey: 'contactInfo', prismaKey: 'contactInfo' },
];

const MERGE_ACTIVITY_CONTENT = 'Duplicate client merged into this record.';
const MERGE_TYPE = 'MANUAL_DUPLICATE_MERGE';

export type MergeAssignmentConflict = {
  assignmentId: string;
  userId: string;
  role: AssignmentRole;
  reason: 'role_occupancy_limit';
};

export type MergeSourceRecordConflict = {
  sourceRecordId: string;
  source: LeadSourceType;
  externalId: string | null;
  reason: 'duplicate_source_external_id';
  duplicatePayload: Prisma.JsonValue;
};

export type MergeFieldChange = {
  before: string | number | null;
  after: string | number | null;
  winner: MergeFieldWinner | 'default';
};

export type MergeClientsSummary = {
  canonicalClientId: string;
  duplicateClientId: string;
  auditId: string;
  interactionsMoved: number;
  dealsMoved: number;
  tasksMoved: number;
  clientDocumentsMoved: number;
  activityLogsMoved: number;
  notificationsUpdated: number;
  sourceRecordsMoved: number;
  sourceRecordsSkipped: number;
  strategiesMoved: number;
  assignmentsMoved: number;
  assignmentsDeduplicated: number;
  assignmentsSkipped: number;
  fieldChanges: Partial<Record<MergeFieldChoiceKey, MergeFieldChange>>;
  conflicts: {
    assignments: MergeAssignmentConflict[];
    sourceRecords: MergeSourceRecordConflict[];
  };
};

function isEmptyScalarValue(
  value: string | number | null | undefined
): boolean {
  if (value == null) {
    return true;
  }

  if (typeof value === 'number') {
    return false;
  }

  return value.trim() === '';
}

function resolveScalarFieldValue(
  canonicalValue: string | number | null,
  duplicateValue: string | number | null,
  choice: MergeFieldWinner | undefined
): { value: string | number | null; winner: MergeFieldWinner | 'default' } {
  if (choice === 'canonical') {
    return { value: canonicalValue, winner: 'canonical' };
  }

  if (choice === 'duplicate') {
    return { value: duplicateValue, winner: 'duplicate' };
  }

  if (!isEmptyScalarValue(canonicalValue)) {
    return { value: canonicalValue, winner: 'default' };
  }

  return { value: duplicateValue, winner: 'default' };
}

function buildMergedClientUpdate(
  canonical: Client,
  duplicate: Client,
  fieldChoices: MergeFieldChoices = {}
) {
  const updateData: Prisma.ClientUpdateInput = {};
  const fieldChanges: Partial<Record<MergeFieldChoiceKey, MergeFieldChange>> =
    {};

  for (const { choiceKey, prismaKey } of MERGEABLE_SCALAR_FIELDS) {
    const canonicalValue = canonical[prismaKey] as string | number | null;
    const duplicateValue = duplicate[prismaKey] as string | number | null;
    const resolved = resolveScalarFieldValue(
      canonicalValue,
      duplicateValue,
      fieldChoices[choiceKey]
    );

    if (resolved.value !== canonicalValue) {
      (updateData as Record<string, string | number | null>)[prismaKey] =
        resolved.value;
    }

    if (
      resolved.value !== canonicalValue ||
      resolved.winner !== 'default' ||
      canonicalValue !== duplicateValue
    ) {
      fieldChanges[choiceKey] = {
        before: canonicalValue,
        after: resolved.value,
        winner: resolved.winner,
      };
    }
  }

  return { updateData, fieldChanges };
}

function sourceRecordKey(source: LeadSourceType, externalId: string | null) {
  return `${source}::${externalId ?? ''}`;
}

async function mergeAssignments(
  tx: Prisma.TransactionClient,
  canonicalClientId: string,
  duplicateClientId: string
) {
  const canonicalAssignments = await tx.clientAssignment.findMany({
    where: { clientId: canonicalClientId },
    select: { userId: true, role: true },
  });
  const duplicateAssignments = await tx.clientAssignment.findMany({
    where: { clientId: duplicateClientId },
    select: { assignmentId: true, userId: true, role: true },
  });

  const canonicalKeys = new Set(
    canonicalAssignments.map(
      (assignment) => `${assignment.userId}:${assignment.role}`
    )
  );
  const roleCounts = new Map<AssignmentRole, number>();

  for (const assignment of canonicalAssignments) {
    roleCounts.set(
      assignment.role,
      (roleCounts.get(assignment.role) ?? 0) + 1
    );
  }

  const conflicts: MergeAssignmentConflict[] = [];
  let assignmentsMoved = 0;
  let assignmentsDeduplicated = 0;
  let assignmentsSkipped = 0;
  const affectedUserIds = new Set<string>();

  for (const assignment of duplicateAssignments) {
    affectedUserIds.add(assignment.userId);
    const key = `${assignment.userId}:${assignment.role}`;

    if (canonicalKeys.has(key)) {
      await tx.clientAssignment.delete({
        where: { assignmentId: assignment.assignmentId },
      });
      assignmentsDeduplicated += 1;
      continue;
    }

    const currentRoleCount = roleCounts.get(assignment.role) ?? 0;
    if (currentRoleCount >= ROLE_OCCUPANCY_LIMITS[assignment.role]) {
      conflicts.push({
        assignmentId: assignment.assignmentId,
        userId: assignment.userId,
        role: assignment.role,
        reason: 'role_occupancy_limit',
      });
      await tx.clientAssignment.delete({
        where: { assignmentId: assignment.assignmentId },
      });
      assignmentsSkipped += 1;
      continue;
    }

    await tx.clientAssignment.update({
      where: { assignmentId: assignment.assignmentId },
      data: { clientId: canonicalClientId },
    });
    canonicalKeys.add(key);
    roleCounts.set(assignment.role, currentRoleCount + 1);
    assignmentsMoved += 1;
  }

  return {
    assignmentsMoved,
    assignmentsDeduplicated,
    assignmentsSkipped,
    conflicts,
    affectedUserIds,
  };
}

async function mergeSourceRecords(
  tx: Prisma.TransactionClient,
  canonicalClientId: string,
  duplicateClientId: string
) {
  const canonicalSourceRecords = await tx.clientSourceRecord.findMany({
    where: { clientId: canonicalClientId },
    select: { source: true, externalId: true },
  });
  const canonicalKeys = new Set(
    canonicalSourceRecords.map((record) =>
      sourceRecordKey(record.source, record.externalId)
    )
  );

  const duplicateSourceRecords = await tx.clientSourceRecord.findMany({
    where: { clientId: duplicateClientId },
    select: {
      id: true,
      source: true,
      externalId: true,
      payload: true,
    },
  });

  const conflicts: MergeSourceRecordConflict[] = [];
  let sourceRecordsMoved = 0;
  let sourceRecordsSkipped = 0;

  for (const record of duplicateSourceRecords) {
    const key = sourceRecordKey(record.source, record.externalId);

    if (canonicalKeys.has(key)) {
      conflicts.push({
        sourceRecordId: record.id,
        source: record.source,
        externalId: record.externalId,
        reason: 'duplicate_source_external_id',
        duplicatePayload: record.payload,
      });
      await tx.clientSourceRecord.delete({
        where: { id: record.id },
      });
      sourceRecordsSkipped += 1;
      continue;
    }

    await tx.clientSourceRecord.update({
      where: { id: record.id },
      data: { clientId: canonicalClientId },
    });
    canonicalKeys.add(key);
    sourceRecordsMoved += 1;
  }

  return { sourceRecordsMoved, sourceRecordsSkipped, conflicts };
}

export async function mergeClients({
  canonicalClientId,
  duplicateClientId,
  mergedByUserId,
  fieldChoices = {},
  reason,
}: MergeClientsInput): Promise<MergeClientsSummary> {
  if (canonicalClientId === duplicateClientId) {
    throw new Error('Cannot merge a client with itself.');
  }

  const [canonical, duplicate] = await Promise.all([
    prisma.client.findUnique({ where: { id: canonicalClientId } }),
    prisma.client.findUnique({ where: { id: duplicateClientId } }),
  ]);

  if (!canonical) {
    throw new Error('Canonical client not found.');
  }

  if (!duplicate) {
    throw new Error('Duplicate client not found.');
  }

  const summary = await prisma.$transaction(async (tx) => {
    const { updateData, fieldChanges } = buildMergedClientUpdate(
      canonical,
      duplicate,
      fieldChoices
    );

    if (Object.keys(updateData).length > 0) {
      await tx.client.update({
        where: { id: canonicalClientId },
        data: updateData,
      });
    }

    const [
      interactionsMoved,
      dealsMoved,
      tasksMoved,
      clientDocumentsMoved,
      activityLogsMoved,
      notificationsUpdated,
      strategiesMoved,
    ] = await Promise.all([
      tx.interaction
        .updateMany({
          where: { clientId: duplicateClientId },
          data: { clientId: canonicalClientId },
        })
        .then((result) => result.count),
      tx.deal
        .updateMany({
          where: { clientId: duplicateClientId },
          data: { clientId: canonicalClientId },
        })
        .then((result) => result.count),
      tx.task
        .updateMany({
          where: { clientId: duplicateClientId },
          data: { clientId: canonicalClientId },
        })
        .then((result) => result.count),
      tx.clientDocument
        .updateMany({
          where: { clientId: duplicateClientId },
          data: { clientId: canonicalClientId },
        })
        .then((result) => result.count),
      tx.clientActivityLog
        .updateMany({
          where: { clientId: duplicateClientId },
          data: { clientId: canonicalClientId },
        })
        .then((result) => result.count),
      tx.notification
        .updateMany({
          where: { linkedClientId: duplicateClientId },
          data: { linkedClientId: canonicalClientId },
        })
        .then((result) => result.count),
      tx.strategy
        .updateMany({
          where: { clientId: duplicateClientId },
          data: { clientId: canonicalClientId },
        })
        .then((result) => result.count),
    ]);

    const {
      sourceRecordsMoved,
      sourceRecordsSkipped,
      conflicts: sourceRecordConflicts,
    } = await mergeSourceRecords(tx, canonicalClientId, duplicateClientId);

    const {
      assignmentsMoved,
      assignmentsDeduplicated,
      assignmentsSkipped,
      conflicts: assignmentConflicts,
      affectedUserIds,
    } = await mergeAssignments(tx, canonicalClientId, duplicateClientId);

    await tx.client.update({
      where: { id: duplicateClientId },
      data: { status: ClientStatus.ARCHIVED },
    });

    await tx.clientActivityLog.create({
      data: {
        clientId: canonicalClientId,
        type: ActivityLogType.SYSTEM,
        content: MERGE_ACTIVITY_CONTENT,
        userId: mergedByUserId,
      },
    });

    const audit = await tx.leadMergeAudit.create({
      data: {
        canonicalClientId,
        mergedClientId: duplicateClientId,
        mergedByUserId,
        mergeType: MERGE_TYPE,
        reason: reason ?? null,
        fieldChanges: fieldChanges as Prisma.InputJsonValue,
        conflicts: {
          assignments: assignmentConflicts,
          sourceRecords: sourceRecordConflicts,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return {
      canonicalClientId,
      duplicateClientId,
      auditId: audit.id,
      interactionsMoved,
      dealsMoved,
      tasksMoved,
      clientDocumentsMoved,
      activityLogsMoved,
      notificationsUpdated,
      sourceRecordsMoved,
      sourceRecordsSkipped,
      strategiesMoved,
      assignmentsMoved,
      assignmentsDeduplicated,
      assignmentsSkipped,
      fieldChanges,
      conflicts: {
        assignments: assignmentConflicts,
        sourceRecords: sourceRecordConflicts,
      },
      affectedUserIds,
    };
  });

  const recalculationUserIds = new Set(summary.affectedUserIds);
  const canonicalAssignments = await prisma.clientAssignment.findMany({
    where: { clientId: canonicalClientId },
    select: { userId: true },
  });

  for (const assignment of canonicalAssignments) {
    recalculationUserIds.add(assignment.userId);
  }

  await Promise.all(
    [...recalculationUserIds].map((userId) =>
      recalculateReturnablesForUserOnClient(userId, canonicalClientId)
    )
  );

  const { affectedUserIds: _affectedUserIds, ...publicSummary } = summary;
  return publicSummary;
}
