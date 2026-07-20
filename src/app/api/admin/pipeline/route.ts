import { NextResponse } from 'next/server';
import {
  ADMIN_PIPELINE_MAX_PER_STATUS_LIMIT,
  ADMIN_PIPELINE_PER_STATUS_LIMIT,
  fetchAdminPipelinePage,
} from '@/lib/adminPipeline';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

function parseOptionalInt(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const assignedUserId = url.searchParams.get('assignedUserId');
  const mode = url.searchParams.get('mode');
  const perStatusLimit = parseOptionalInt(
    url.searchParams.get('perStatusLimit')
  );

  const payload = await timeRouteHandler(
    'GET /api/admin/pipeline',
    async () =>
      fetchAdminPipelinePage({
        status,
        assignedUserId,
        mode,
        perStatusLimit,
      }),
    {
      payloadCategory: 'admin-pipeline',
      getMeta: (result) => ({
        clientCount: result.clients.length,
        returned: result.meta.returned,
        total: result.meta.total,
        hasMore: result.meta.hasMore,
        dbBounded: result.meta.dbBounded,
        limitMode: result.meta.limitMode,
        perStatusLimit: result.meta.perStatusLimit,
        fallbackReason: result.meta.fallbackReason,
        statusFilter: result.meta.statusFilter,
        defaultPerStatusLimit: ADMIN_PIPELINE_PER_STATUS_LIMIT,
        maxPerStatusLimit: ADMIN_PIPELINE_MAX_PER_STATUS_LIMIT,
      }),
    }
  );

  return NextResponse.json(payload);
}
