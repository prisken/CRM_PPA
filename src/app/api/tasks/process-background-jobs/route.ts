import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { processBackgroundJobs } from '@/lib/backgroundJobs';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

/**
 * Process due BackgroundJob rows (returnable recalculation and future types).
 * Auth: super admin session/Bearer, or Authorization: Bearer ${CRON_SECRET}.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get('authorization');
  const isCron =
    Boolean(cronSecret) &&
    (authHeader === `Bearer ${cronSecret}` ||
      request.headers.get('x-cron-secret') === cronSecret);

  if (!isCron) {
    const auth = await requireSuperAdminFromRequest(request);
    if (auth.error) {
      return auth.error;
    }
  }

  const body = await request.json().catch(() => ({}));
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? body.limit
      : undefined;

  const result = await timeRouteHandler(
    'POST /api/tasks/process-background-jobs',
    () => processBackgroundJobs({ limit }),
    (summary) => ({
      claimed: summary.claimed,
      succeeded: summary.succeeded,
      failed: summary.failed,
    })
  );

  return NextResponse.json({ ok: true, ...result });
}
