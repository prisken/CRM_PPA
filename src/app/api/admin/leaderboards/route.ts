import { NextResponse } from 'next/server';
import { getCachedAdminLeaderboardsData } from '@/lib/adminAnalyticsCache';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const leaderboards = await timeRouteHandler('GET /api/admin/leaderboards', () =>
    getCachedAdminLeaderboardsData()
  );
  return NextResponse.json(leaderboards);
}
