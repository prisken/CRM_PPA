import { NextResponse } from 'next/server';
import { requireCronSecretOrSuperAdmin } from '@/lib/authHelpers';
import { processBackgroundJobs } from '@/lib/backgroundJobs';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

/**
 * Process due BackgroundJob rows (returnable recalculation and future types).
 *
 * Auth (required — never open):
 * - `Authorization: Bearer ${CRON_SECRET}` or `x-cron-secret: ${CRON_SECRET}`
 * - OR super admin session / Bearer JWT
 *
 * Set `CRON_SECRET` in staging/production for HTTP cron callers.
 */
export async function POST(request: Request) {
  const gate = await requireCronSecretOrSuperAdmin(request);
  if ('error' in gate && gate.error) {
    return gate.error;
  }

  const body = await request.json().catch(() => ({}));
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? body.limit
      : undefined;

  const result = await timeRouteHandler(
    'POST /api/tasks/process-background-jobs',
    () => processBackgroundJobs({ limit }),
    {
      getMeta: (summary) => ({
        claimed: summary.claimed,
        succeeded: summary.succeeded,
        failed: summary.failed,
        reclaimedStuck: summary.reclaimedStuck,
        authVia: 'via' in gate ? gate.via : 'unknown',
      }),
    }
  );

  return NextResponse.json({ ok: true, ...result });
}
