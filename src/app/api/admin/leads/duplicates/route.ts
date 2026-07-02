import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { fetchLeadDuplicateGroups } from '@/lib/leadDuplicates';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const DEFAULT_GROUP_LIMIT = 100;
const MAX_GROUP_LIMIT = 500;

function parseBooleanParam(value: string | null): boolean {
  return value === 'true';
}

function parseLimit(value: string | null): number {
  if (value === null || value.trim() === '') {
    return DEFAULT_GROUP_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_GROUP_LIMIT;
  }

  return Math.min(parsed, MAX_GROUP_LIMIT);
}

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const includeArchived = parseBooleanParam(searchParams.get('includeArchived'));
  const limit = parseLimit(searchParams.get('limit'));

  const payload = await timeRouteHandler(
    'GET /api/admin/leads/duplicates',
    () =>
      fetchLeadDuplicateGroups({
        includeArchived,
        limit,
      }),
    (result) => ({
      groupCount: result.groups.length,
      limit: result.meta.limit,
      includeArchived,
    })
  );

  return NextResponse.json(payload);
}
