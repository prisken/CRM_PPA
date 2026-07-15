import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import {
  mergeClients,
  type MergeFieldChoiceKey,
  type MergeFieldChoices,
  type MergeFieldOverrides,
  type MergeFieldWinner,
} from '@/lib/clientMerge';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

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
  'Cannot merge a client with itself.',
  'Canonical client not found.',
  'Duplicate client not found.',
  'name is required.',
  'employee_count must be an integer greater than or equal to 0.',
  'priority must be LOW, MEDIUM, HIGH, or null.',
  'next_follow_up_at must be a valid date or null.',
]);

function parseClientId(
  value: unknown,
  fieldName: string
): { clientId: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: `${fieldName} is required` };
  }

  return { clientId: value.trim() };
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

function parseReason(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

  const parsedDuplicate = parseClientId(body.duplicateClientId, 'duplicateClientId');
  if ('error' in parsedDuplicate) {
    return NextResponse.json({ error: parsedDuplicate.error }, { status: 400 });
  }

  const parsedFieldChoices = parseFieldChoices(body.fieldChoices);
  if ('error' in parsedFieldChoices) {
    return NextResponse.json({ error: parsedFieldChoices.error }, { status: 400 });
  }

  const parsedFieldOverrides = parseFieldOverrides(body.fieldOverrides);
  if ('error' in parsedFieldOverrides) {
    return NextResponse.json({ error: parsedFieldOverrides.error }, { status: 400 });
  }

  const reason = parseReason(body.reason);

  try {
    const payload = await timeRouteHandler(
      'POST /api/admin/leads/merge',
      () =>
        mergeClients({
          canonicalClientId: parsedCanonical.clientId,
          duplicateClientId: parsedDuplicate.clientId,
          mergedByUserId: auth.user.id,
          fieldChoices: parsedFieldChoices,
          fieldOverrides: parsedFieldOverrides,
          reason,
        }),
      (summary) => ({
        auditId: summary.auditId,
        interactionsMoved: summary.interactionsMoved,
        dealsMoved: summary.dealsMoved,
        assignmentsSkipped: summary.assignmentsSkipped,
      })
    );

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to merge clients';

    const status = MERGE_VALIDATION_ERRORS.has(message) ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
