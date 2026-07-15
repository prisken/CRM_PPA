import {
  ActivityLogType,
  AssignmentRole,
  Client,
  ClientStatus,
  LeadSourceType,
  Prisma,
} from '@prisma/client';
import { recalculateReturnablesForUserOnClient } from '@/lib/commissionReturnables';
import { mergeContactsOntoCanonical } from '@/lib/clientContacts';
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
  | 'contactInfo'
  | 'priority'
  | 'next_action'
  | 'next_follow_up_at';

export type MergeFieldWinner = 'canonical' | 'duplicate';

export type MergeFieldResolutionSource = MergeFieldWinner | 'override' | 'default';

export type MergeFieldChoices = Partial<
  Record<MergeFieldChoiceKey, MergeFieldWinner>
>;

export type MergeFieldOverrides = Partial<{
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  lead_source: string | null;
  role_in_company: string | null;
  employee_count: number | null;
  expectations: string | null;
  contactInfo: string | null;
  priority: string | null;
  next_action: string | null;
  next_follow_up_at: string | null;
}>;

export type MergeClientsInput = {
  canonicalClientId: string;
  duplicateClientId: string;
  mergedByUserId: string;
  fieldChoices?: MergeFieldChoices;
  fieldOverrides?: MergeFieldOverrides;
  reason?: string;
};

export type MergeFieldChoicesByDuplicateId = Record<
  string,
  Partial<Record<MergeFieldChoiceKey, MergeFieldWinner>>
>;

export type MergeMultipleClientsInput = {
  canonicalClientId: string;
  duplicateClientIds: string[];
  mergedByUserId: string;
  fieldChoicesByDuplicateId?: MergeFieldChoicesByDuplicateId;
  fieldOverrides?: MergeFieldOverrides;
  reason?: string;
};

export type MergeMultipleClientsSummary = {
  ok: true;
  canonicalClientId: string;
  mergedClientIds: string[];
  auditIds: string[];
  conflicts: {
    assignments: MergeAssignmentConflict[];
    sourceRecords: MergeSourceRecordConflict[];
  };
  fieldChanges: Partial<Record<MergeFieldChoiceKey, MergeFieldChange>>;
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

type MergeableFollowUpField = {
  choiceKey: Extract<
    MergeFieldChoiceKey,
    'priority' | 'next_action' | 'next_follow_up_at'
  >;
  prismaKey: 'priority' | 'nextAction' | 'nextFollowUpAt';
};

const MERGEABLE_FOLLOW_UP_FIELDS: MergeableFollowUpField[] = [
  { choiceKey: 'priority', prismaKey: 'priority' },
  { choiceKey: 'next_action', prismaKey: 'nextAction' },
  { choiceKey: 'next_follow_up_at', prismaKey: 'nextFollowUpAt' },
];

const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);

const MERGE_ACTIVITY_CONTENT = 'Duplicate client merged into this record.';
const MERGE_ACTIVITY_FINAL_OVERRIDES_CONTENT =
  'Final merge field overrides applied to canonical record.';
const MERGE_TYPE = 'MANUAL_DUPLICATE_MERGE';
const MAX_CLIENTS_PER_MULTI_MERGE = 10;

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
  winner: MergeFieldResolutionSource;
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

function hasFieldOverride(
  fieldOverrides: MergeFieldOverrides,
  key: keyof MergeFieldOverrides
) {
  return Object.prototype.hasOwnProperty.call(fieldOverrides, key);
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeRequiredName(value: string | null | undefined): string {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    throw new Error('name is required.');
  }

  return normalized;
}

function normalizeEmployeeCountOverride(
  value: number | null | undefined
): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('employee_count must be an integer greater than or equal to 0.');
  }

  return value;
}

function normalizePriorityOverride(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  const normalized = trimmed.toUpperCase();
  if (!VALID_PRIORITIES.has(normalized)) {
    throw new Error('priority must be LOW, MEDIUM, HIGH, or null.');
  }

  return normalized;
}

function normalizeNextFollowUpAtOverride(
  value: string | null | undefined
): Date | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('next_follow_up_at must be a valid date or null.');
  }

  return parsed;
}

function finalizeNullableString(
  value: string | number | null,
  required = false
): string | null {
  if (typeof value === 'number') {
    return String(value);
  }

  if (required) {
    return normalizeRequiredName(value);
  }

  return normalizeNullableString(value);
}

function toAuditValue(value: string | number | Date | null): string | number | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

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
): { value: string | number | null; winner: MergeFieldResolutionSource } {
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

function resolveStringFieldValue(
  canonicalValue: string | null,
  duplicateValue: string | null,
  choice: MergeFieldWinner | undefined,
  overrideValue: string | null | undefined,
  overridePresent: boolean,
  options: { required?: boolean } = {}
): { value: string | null; winner: MergeFieldResolutionSource } {
  if (overridePresent) {
    const value = options.required
      ? normalizeRequiredName(overrideValue)
      : normalizeNullableString(overrideValue ?? null);

    return { value, winner: 'override' };
  }

  const resolved = resolveScalarFieldValue(canonicalValue, duplicateValue, choice);
  const value = finalizeNullableString(resolved.value, options.required);

  return { value, winner: resolved.winner };
}

function resolveEmployeeCountFieldValue(
  canonicalValue: number | null,
  duplicateValue: number | null,
  choice: MergeFieldWinner | undefined,
  overrideValue: number | null | undefined,
  overridePresent: boolean
): { value: number | null; winner: MergeFieldResolutionSource } {
  if (overridePresent) {
    return {
      value: normalizeEmployeeCountOverride(overrideValue),
      winner: 'override',
    };
  }

  return resolveScalarFieldValue(canonicalValue, duplicateValue, choice) as {
    value: number | null;
    winner: MergeFieldResolutionSource;
  };
}

function resolveDateFieldValue(
  canonicalValue: Date | null,
  duplicateValue: Date | null,
  choice: MergeFieldWinner | undefined,
  overrideValue: string | null | undefined,
  overridePresent: boolean
): { value: Date | null; winner: MergeFieldResolutionSource } {
  if (overridePresent) {
    return {
      value: normalizeNextFollowUpAtOverride(overrideValue ?? null),
      winner: 'override',
    };
  }

  if (choice === 'canonical') {
    return { value: canonicalValue, winner: 'canonical' };
  }

  if (choice === 'duplicate') {
    return { value: duplicateValue, winner: 'duplicate' };
  }

  if (canonicalValue != null) {
    return { value: canonicalValue, winner: 'default' };
  }

  return { value: duplicateValue, winner: 'default' };
}

function recordFieldChange(
  fieldChanges: Partial<Record<MergeFieldChoiceKey, MergeFieldChange>>,
  choiceKey: MergeFieldChoiceKey,
  before: string | number | Date | null,
  after: string | number | Date | null,
  winner: MergeFieldResolutionSource,
  canonicalComparable: string | number | Date | null
) {
  const auditBefore = toAuditValue(before);
  const auditAfter = toAuditValue(after);

  if (
    auditAfter !== auditBefore ||
    winner !== 'default' ||
    auditBefore !== toAuditValue(canonicalComparable)
  ) {
    fieldChanges[choiceKey] = {
      before: auditBefore,
      after: auditAfter,
      winner,
    };
  }
}

function buildMergedClientUpdate(
  canonical: Client,
  duplicate: Client,
  fieldChoices: MergeFieldChoices = {},
  fieldOverrides: MergeFieldOverrides = {}
) {
  const updateData: Prisma.ClientUpdateInput = {};
  const fieldChanges: Partial<Record<MergeFieldChoiceKey, MergeFieldChange>> =
    {};

  for (const { choiceKey, prismaKey } of MERGEABLE_SCALAR_FIELDS) {
    const canonicalValue = canonical[prismaKey] as string | number | null;
    const duplicateValue = duplicate[prismaKey] as string | number | null;
    const overridePresent = hasFieldOverride(fieldOverrides, choiceKey);

    const resolved =
      choiceKey === 'employee_count'
        ? resolveEmployeeCountFieldValue(
            canonicalValue as number | null,
            duplicateValue as number | null,
            fieldChoices[choiceKey],
            fieldOverrides.employee_count,
            overridePresent
          )
        : resolveStringFieldValue(
            canonicalValue as string | null,
            duplicateValue as string | null,
            fieldChoices[choiceKey],
            fieldOverrides[choiceKey] as string | null | undefined,
            overridePresent,
            { required: choiceKey === 'name' }
          );

    if (resolved.value !== canonicalValue) {
      (updateData as Record<string, string | number | null>)[prismaKey] =
        resolved.value;
    }

    recordFieldChange(
      fieldChanges,
      choiceKey,
      canonicalValue,
      resolved.value,
      resolved.winner,
      canonicalValue
    );
  }

  for (const { choiceKey, prismaKey } of MERGEABLE_FOLLOW_UP_FIELDS) {
    const canonicalValue = canonical[prismaKey] as string | Date | null;
    const duplicateValue = duplicate[prismaKey] as string | Date | null;
    const overridePresent = hasFieldOverride(fieldOverrides, choiceKey);

    if (choiceKey === 'next_follow_up_at') {
      const resolved = resolveDateFieldValue(
        canonicalValue as Date | null,
        duplicateValue as Date | null,
        fieldChoices[choiceKey],
        fieldOverrides.next_follow_up_at,
        overridePresent
      );

      if (resolved.value?.getTime() !== (canonicalValue as Date | null)?.getTime()) {
        updateData.nextFollowUpAt = resolved.value;
      }

      recordFieldChange(
        fieldChanges,
        choiceKey,
        canonicalValue as Date | null,
        resolved.value,
        resolved.winner,
        canonicalValue as Date | null
      );
      continue;
    }

    const resolved = overridePresent
      ? {
          value:
            choiceKey === 'priority'
              ? normalizePriorityOverride(fieldOverrides.priority)
              : normalizeNullableString(fieldOverrides.next_action ?? null),
          winner: 'override' as const,
        }
      : (() => {
          const base = resolveScalarFieldValue(
            canonicalValue as string | null,
            duplicateValue as string | null,
            fieldChoices[choiceKey]
          );

          return {
            value: finalizeNullableString(base.value),
            winner: base.winner,
          };
        })();

    if (resolved.value !== canonicalValue) {
      (updateData as Record<string, string | null>)[prismaKey] = resolved.value;
    }

    recordFieldChange(
      fieldChanges,
      choiceKey,
      canonicalValue,
      resolved.value,
      resolved.winner,
      canonicalValue
    );
  }

  const finalName =
    (updateData.name as string | undefined) ?? canonical.name ?? duplicate.name;
  if (!normalizeNullableString(finalName)) {
    throw new Error('name is required.');
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

function createNullFieldDuplicate(canonical: Client): Client {
  return {
    ...canonical,
    name: '',
    company: null,
    email: null,
    phone: null,
    leadSource: null,
    roleInCompany: null,
    employeeCount: null,
    expectations: null,
    contactInfo: null,
    priority: null,
    nextAction: null,
    nextFollowUpAt: null,
  };
}

function validateMultiMergeInput({
  canonicalClientId,
  duplicateClientIds,
}: Pick<MergeMultipleClientsInput, 'canonicalClientId' | 'duplicateClientIds'>) {
  if (duplicateClientIds.length < 1) {
    throw new Error('At least one duplicate client id is required.');
  }

  if (new Set(duplicateClientIds).size !== duplicateClientIds.length) {
    throw new Error('duplicateClientIds must not contain duplicate ids.');
  }

  if (duplicateClientIds.includes(canonicalClientId)) {
    throw new Error('canonicalClientId cannot appear in duplicateClientIds.');
  }

  const totalClients = 1 + duplicateClientIds.length;
  if (totalClients > MAX_CLIENTS_PER_MULTI_MERGE) {
    throw new Error(
      `Cannot merge more than ${MAX_CLIENTS_PER_MULTI_MERGE} clients at once.`
    );
  }
}

type ClientMergeTransactionResult = MergeClientsSummary & {
  affectedUserIds: Set<string>;
};

async function executeClientMergeInTransaction(
  tx: Prisma.TransactionClient,
  {
    canonical,
    duplicate,
    canonicalClientId,
    duplicateClientId,
    mergedByUserId,
    fieldChoices = {},
    fieldOverrides = {},
    reason,
  }: {
    canonical: Client;
    duplicate: Client;
    canonicalClientId: string;
    duplicateClientId: string;
    mergedByUserId: string;
    fieldChoices?: MergeFieldChoices;
    fieldOverrides?: MergeFieldOverrides;
    reason?: string;
  }
): Promise<ClientMergeTransactionResult> {
  const { updateData, fieldChanges } = buildMergedClientUpdate(
    canonical,
    duplicate,
    fieldChoices,
    fieldOverrides
  );

  if (Object.keys(updateData).length > 0) {
    await tx.client.update({
      where: { id: canonicalClientId },
      data: updateData,
    });
  }

  const mergedCanonical = await tx.client.findUniqueOrThrow({
    where: { id: canonicalClientId },
    select: { email: true, phone: true },
  });

  await mergeContactsOntoCanonical(
    tx,
    canonicalClientId,
    duplicateClientId,
    mergedCanonical.email,
    mergedCanonical.phone
  );

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
}

async function recalculateReturnablesForCanonical(
  canonicalClientId: string,
  affectedUserIds: Set<string>
) {
  const recalculationUserIds = new Set(affectedUserIds);
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
}

export async function mergeClients({
  canonicalClientId,
  duplicateClientId,
  mergedByUserId,
  fieldChoices = {},
  fieldOverrides = {},
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

  const summary = await prisma.$transaction((tx) =>
    executeClientMergeInTransaction(tx, {
      canonical,
      duplicate,
      canonicalClientId,
      duplicateClientId,
      mergedByUserId,
      fieldChoices,
      fieldOverrides,
      reason,
    })
  );

  await recalculateReturnablesForCanonical(
    canonicalClientId,
    summary.affectedUserIds
  );

  const { affectedUserIds: _affectedUserIds, ...publicSummary } = summary;
  return publicSummary;
}

export async function mergeMultipleClients({
  canonicalClientId,
  duplicateClientIds,
  mergedByUserId,
  fieldChoicesByDuplicateId = {},
  fieldOverrides = {},
  reason,
}: MergeMultipleClientsInput): Promise<MergeMultipleClientsSummary> {
  validateMultiMergeInput({ canonicalClientId, duplicateClientIds });

  const allClientIds = [canonicalClientId, ...duplicateClientIds];
  const clients = await prisma.client.findMany({
    where: { id: { in: allClientIds } },
  });
  const clientMap = new Map(clients.map((client) => [client.id, client]));

  if (!clientMap.has(canonicalClientId)) {
    throw new Error('Canonical client not found.');
  }

  for (const duplicateClientId of duplicateClientIds) {
    if (!clientMap.has(duplicateClientId)) {
      throw new Error(`Duplicate client not found: ${duplicateClientId}`);
    }
  }

  // One transaction: pairwise merges without fieldOverrides, then apply overrides once.
  // fieldOverrides are intentionally excluded from pairwise merges so later duplicates
  // cannot overwrite custom final values.
  const summary = await prisma.$transaction(async (tx) => {
    let currentCanonical = clientMap.get(canonicalClientId)!;
    const auditIds: string[] = [];
    const mergedClientIds: string[] = [];
    const assignmentConflicts: MergeAssignmentConflict[] = [];
    const sourceRecordConflicts: MergeSourceRecordConflict[] = [];
    const aggregateFieldChanges: Partial<
      Record<MergeFieldChoiceKey, MergeFieldChange>
    > = {};
    const affectedUserIds = new Set<string>();

    for (const duplicateClientId of duplicateClientIds) {
      const duplicate = clientMap.get(duplicateClientId)!;
      const mergeResult = await executeClientMergeInTransaction(tx, {
        canonical: currentCanonical,
        duplicate,
        canonicalClientId,
        duplicateClientId,
        mergedByUserId,
        fieldChoices: fieldChoicesByDuplicateId[duplicateClientId] ?? {},
        fieldOverrides: {},
        reason,
      });

      auditIds.push(mergeResult.auditId);
      mergedClientIds.push(duplicateClientId);
      assignmentConflicts.push(...mergeResult.conflicts.assignments);
      sourceRecordConflicts.push(...mergeResult.conflicts.sourceRecords);
      Object.assign(aggregateFieldChanges, mergeResult.fieldChanges);
      for (const userId of mergeResult.affectedUserIds) {
        affectedUserIds.add(userId);
      }

      currentCanonical = await tx.client.findUniqueOrThrow({
        where: { id: canonicalClientId },
      });
    }

    if (Object.keys(fieldOverrides).length > 0) {
      const { updateData, fieldChanges } = buildMergedClientUpdate(
        currentCanonical,
        createNullFieldDuplicate(currentCanonical),
        {},
        fieldOverrides
      );

      if (Object.keys(updateData).length > 0) {
        await tx.client.update({
          where: { id: canonicalClientId },
          data: updateData,
        });
      }

      Object.assign(aggregateFieldChanges, fieldChanges);

      if (auditIds.length > 0) {
        const lastAuditId = auditIds[auditIds.length - 1];
        const lastAudit = await tx.leadMergeAudit.findUniqueOrThrow({
          where: { id: lastAuditId },
          select: { fieldChanges: true },
        });
        const priorFieldChanges =
          (lastAudit.fieldChanges as Partial<
            Record<MergeFieldChoiceKey, MergeFieldChange>
          > | null) ?? {};

        await tx.leadMergeAudit.update({
          where: { id: lastAuditId },
          data: {
            fieldChanges: {
              ...priorFieldChanges,
              ...fieldChanges,
            } as Prisma.InputJsonValue,
          },
        });
      }

      await tx.clientActivityLog.create({
        data: {
          clientId: canonicalClientId,
          type: ActivityLogType.SYSTEM,
          content: MERGE_ACTIVITY_FINAL_OVERRIDES_CONTENT,
          userId: mergedByUserId,
        },
      });
    }

    return {
      auditIds,
      mergedClientIds,
      conflicts: {
        assignments: assignmentConflicts,
        sourceRecords: sourceRecordConflicts,
      },
      fieldChanges: aggregateFieldChanges,
      affectedUserIds,
    };
  });

  await recalculateReturnablesForCanonical(
    canonicalClientId,
    summary.affectedUserIds
  );

  return {
    ok: true,
    canonicalClientId,
    mergedClientIds: summary.mergedClientIds,
    auditIds: summary.auditIds,
    conflicts: summary.conflicts,
    fieldChanges: summary.fieldChanges,
  };
}
