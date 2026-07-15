import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import {
  mergeMultipleClients,
  type MergeFieldChoiceKey,
  type MergeFieldChoices,
  type MergeFieldChoicesByDuplicateId,
  type MergeFieldOverrides,
  type MergeFieldWinner,
} from '@/lib/clientMerge';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const MAX_DUPLICATE_CLIENT_IDS = 9;
const MAX_REASON_LENGTH = 1000;

const VALID_FIELD_KEYS = new Set<MergeFieldChoiceKey>([
  'name',
  'company',
  'email',
  'phone',
  'lead_source',
  'role_in_company',
  'employee_count',
  'expectations',
  'contactInfo',
  'priority',
  'next_action',
  'next_follow_up_at',
]);

const VALID_OVERRIDE_KEYS = new Set<keyof MergeFieldOverrides>([
  'name',
  'company',
  'email',
  'phone',
  'lead_source',
  'role_in_company',
  'employee_count',
  'expectations',
  'contactInfo',
  'priority',
  'next_action',
  'next_follow_up_at',
]);

const MERGE_VALIDATION_ERRORS = new Set([
  'At least one duplicate client id is required.',
  'duplicateClientIds must not contain duplicate ids.',
  'canonicalClientId cannot appear in duplicateClientIds.',
  'Cannot merge more than 10 clients at once.',
  'Canonical client not found.',
  'Duplicate client not found.',
  'name is required.',
  'employee_count must be an integer greater than or equal to 0.',
  'priority must be LOW, MEDIUM, HIGH, or null.',
  'next_follow_up_at must be a valid date or null.',
]);

function isMergeValidationError(message: string): boolean {
  if (MERGE_VALIDATION_ERRORS.has(message)) {
    return true;
  }

  return message.startsWith('Duplicate client not found:');
}

function parseClientId(
  value: unknown,
  fieldName: string
): { clientId: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: `${fieldName} is required` };
  }

  return { clientId: value.trim() };
}

function parseDuplicateClientIds(
  value: unknown,
  canonicalClientId: string
): { duplicateClientIds: string[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: 'duplicateClientIds must be an array' };
  }

  if (value.length < 1) {
    return { error: 'duplicateClientIds must contain at least one id' };
  }

  if (value.length > MAX_DUPLICATE_CLIENT_IDS) {
    return {
      error: `duplicateClientIds must contain at most ${MAX_DUPLICATE_CLIENT_IDS} ids`,
    };
  }

  const duplicateClientIds: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];

    if (typeof item !== 'string' || !item.trim()) {
      return {
        error: `duplicateClientIds[${index}] must be a non-empty string`,
      };
    }

    const clientId = item.trim();

    if (seen.has(clientId)) {
      return { error: 'duplicateClientIds must not contain duplicate ids' };
    }

    seen.add(clientId);
    duplicateClientIds.push(clientId);
  }

  if (duplicateClientIds.includes(canonicalClientId)) {
    return { error: 'canonicalClientId cannot appear in duplicateClientIds' };
  }

  return { duplicateClientIds };
}

function parseFieldChoices(value: unknown): MergeFieldChoices | { error: string } {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'fieldChoices must be an object' };
  }

  const fieldChoices: MergeFieldChoices = {};

  for (const [key, winner] of Object.entries(value)) {
    if (!VALID_FIELD_KEYS.has(key as MergeFieldChoiceKey)) {
      return { error: `Invalid fieldChoices key: ${key}` };
    }

    if (winner !== 'canonical' && winner !== 'duplicate') {
      return {
        error: `fieldChoices.${key} must be "canonical" or "duplicate"`,
      };
    }

    fieldChoices[key as MergeFieldChoiceKey] = winner as MergeFieldWinner;
  }

  return fieldChoices;
}

function parseFieldChoicesByDuplicateId(
  value: unknown,
  validDuplicateIds: Set<string>
): MergeFieldChoicesByDuplicateId | { error: string } {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'fieldChoicesByDuplicateId must be an object' };
  }

  const fieldChoicesByDuplicateId: MergeFieldChoicesByDuplicateId = {};

  for (const [duplicateId, choices] of Object.entries(value)) {
    if (!validDuplicateIds.has(duplicateId)) {
      return {
        error: `fieldChoicesByDuplicateId contains unknown duplicate id: ${duplicateId}`,
      };
    }

    const parsedChoices = parseFieldChoices(choices);
    if ('error' in parsedChoices) {
      return {
        error: `fieldChoicesByDuplicateId.${duplicateId}: ${parsedChoices.error}`,
      };
    }

    if (Object.keys(parsedChoices).length > 0) {
      fieldChoicesByDuplicateId[duplicateId] = parsedChoices;
    }
  }

  return fieldChoicesByDuplicateId;
}

function parseFieldOverrides(
  value: unknown
): MergeFieldOverrides | { error: string } {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'fieldOverrides must be an object' };
  }

  const fieldOverrides: MergeFieldOverrides = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (!VALID_OVERRIDE_KEYS.has(key as keyof MergeFieldOverrides)) {
      return { error: `Invalid fieldOverrides key: ${key}` };
    }

    if (key === 'employee_count') {
      if (rawValue !== null && typeof rawValue !== 'number') {
        return {
          error: 'fieldOverrides.employee_count must be a number or null',
        };
      }

      if (
        rawValue !== null &&
        (!Number.isInteger(rawValue) || rawValue < 0)
      ) {
        return {
          error:
            'fieldOverrides.employee_count must be an integer greater than or equal to 0',
        };
      }

      fieldOverrides.employee_count = rawValue;
      continue;
    }

    if (rawValue !== null && typeof rawValue !== 'string') {
      return { error: `fieldOverrides.${key} must be a string or null` };
    }

    if (key === 'name' && typeof rawValue === 'string' && rawValue.trim() === '') {
      return { error: 'fieldOverrides.name cannot be blank' };
    }

    fieldOverrides[key as Exclude<keyof MergeFieldOverrides, 'employee_count'>] =
      rawValue;
  }

  return fieldOverrides;
}

function parseReason(value: unknown): { reason?: string } | { error: string } {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'string') {
    return { error: 'reason must be a string' };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {};
  }

  if (trimmed.length > MAX_REASON_LENGTH) {
    return { error: `reason must be at most ${MAX_REASON_LENGTH} characters` };
  }

  return { reason: trimmed };
}

export async function POST(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();

  const parsedCanonical = parseClientId(body.canonicalClientId, 'canonicalClientId');
  if ('error' in parsedCanonical) {
    return NextResponse.json({ error: parsedCanonical.error }, { status: 400 });
  }

  const parsedDuplicates = parseDuplicateClientIds(
    body.duplicateClientIds,
    parsedCanonical.clientId
  );
  if ('error' in parsedDuplicates) {
    return NextResponse.json({ error: parsedDuplicates.error }, { status: 400 });
  }

  const parsedFieldChoicesByDuplicateId = parseFieldChoicesByDuplicateId(
    body.fieldChoicesByDuplicateId,
    new Set(parsedDuplicates.duplicateClientIds)
  );
  if ('error' in parsedFieldChoicesByDuplicateId) {
    return NextResponse.json(
      { error: parsedFieldChoicesByDuplicateId.error },
      { status: 400 }
    );
  }

  const parsedFieldOverrides = parseFieldOverrides(body.fieldOverrides);
  if ('error' in parsedFieldOverrides) {
    return NextResponse.json({ error: parsedFieldOverrides.error }, { status: 400 });
  }

  const parsedReason = parseReason(body.reason);
  if ('error' in parsedReason) {
    return NextResponse.json({ error: parsedReason.error }, { status: 400 });
  }

  try {
    const result = await timeRouteHandler(
      'POST /api/admin/leads/merge-multiple',
      () =>
        mergeMultipleClients({
          canonicalClientId: parsedCanonical.clientId,
          duplicateClientIds: parsedDuplicates.duplicateClientIds,
          mergedByUserId: auth.user.id,
          fieldChoicesByDuplicateId: parsedFieldChoicesByDuplicateId,
          fieldOverrides: parsedFieldOverrides,
          reason: parsedReason.reason,
        }),
      (summary) => ({
        mergedCount: summary.mergedClientIds.length,
        auditCount: summary.auditIds.length,
      })
    );

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to merge clients';

    const status = isMergeValidationError(message) ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
