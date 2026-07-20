import { ClientStatus, LeadSourceType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import {
  fetchLeadCommandCenterRows,
  type LeadCommandCenterFilters,
} from '@/lib/leadCommandCenter';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const LEAD_SOURCE_LABEL_TO_ENUM: Record<string, LeadSourceType> = {
  'google forms': LeadSourceType.GOOGLE_FORMS,
  'profit pulse ally': LeadSourceType.PROFIT_PULSE_ALLY,
  manual: LeadSourceType.MANUAL,
  other: LeadSourceType.OTHER,
};

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function parseOptionalInt(value: string | null): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function parseCommaSeparated(value: string | null): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseStatuses(value: string | null): string[] | undefined {
  const statuses = parseCommaSeparated(value);
  if (statuses.length === 0) {
    return undefined;
  }

  const allowed = new Set<string>(Object.values(ClientStatus));
  const parsed = statuses.filter((status) => allowed.has(status));

  return parsed.length > 0 ? parsed : undefined;
}

function parseSources(value: string | null): string[] | undefined {
  const sources = parseCommaSeparated(value);
  if (sources.length === 0) {
    return undefined;
  }

  const enumValues = new Set<string>(Object.values(LeadSourceType));
  const parsed = new Set<LeadSourceType>();

  for (const source of sources) {
    if (enumValues.has(source)) {
      parsed.add(source as LeadSourceType);
      continue;
    }

    const byLabel = LEAD_SOURCE_LABEL_TO_ENUM[source.toLowerCase()];
    if (byLabel) {
      parsed.add(byLabel);
    }
  }

  const resolved = [...parsed];
  return resolved.length > 0 ? resolved : undefined;
}

function parseLeadCommandCenterFilters(
  searchParams: URLSearchParams
): LeadCommandCenterFilters {
  const limit = parseOptionalInt(searchParams.get('limit'));
  const offset = parseOptionalInt(searchParams.get('offset'));

  return {
    search: searchParams.get('search')?.trim() || undefined,
    statuses: parseStatuses(searchParams.get('status')),
    sources: parseSources(searchParams.get('source')),
    assignedUserId: searchParams.get('assignedUserId')?.trim() || undefined,
    missingEmail: parseBooleanParam(searchParams.get('missingEmail')),
    missingPhone: parseBooleanParam(searchParams.get('missingPhone')),
    unassigned: parseBooleanParam(searchParams.get('unassigned')),
    duplicateEmail: parseBooleanParam(searchParams.get('duplicateEmail')),
    duplicatePhone: parseBooleanParam(searchParams.get('duplicatePhone')),
    needsAttention: parseBooleanParam(searchParams.get('needsAttention')),
    overdueFollowUp: parseBooleanParam(searchParams.get('overdueFollowUp')),
    dueToday: parseBooleanParam(searchParams.get('dueToday')),
    noNextAction: parseBooleanParam(searchParams.get('noNextAction')),
    createdFrom: searchParams.get('createdFrom')?.trim() || undefined,
    createdTo: searchParams.get('createdTo')?.trim() || undefined,
    latestSourceFrom: searchParams.get('latestSourceFrom')?.trim() || undefined,
    latestSourceTo: searchParams.get('latestSourceTo')?.trim() || undefined,
    tagIds: (() => {
      const values = parseCommaSeparated(searchParams.get('tagIds'));
      return values.length > 0 ? values : undefined;
    })(),
    tagNames: (() => {
      const values = parseCommaSeparated(searchParams.get('tagNames'));
      return values.length > 0 ? values : undefined;
    })(),
    limit,
    offset,
  };
}

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const filters = parseLeadCommandCenterFilters(searchParams);
    const offset = filters.offset ?? 0;
    const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const payload = await timeRouteHandler(
      'GET /api/admin/leads',
      async () => {
        const leads = await fetchLeadCommandCenterRows({
          ...filters,
          limit,
        });

        return {
          leads,
          meta: {
            count: leads.length,
            limit,
            offset,
          },
        };
      },
      {
        payloadCategory: 'lead-command-center',
        getMeta: (result) => ({
          leadCount: result.leads.length,
          limit: result.meta.limit,
          offset: result.meta.offset,
        }),
      }
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error('GET /api/admin/leads failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to load leads';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
