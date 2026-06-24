import { NextResponse } from 'next/server';
import { getCachedAdminDashboardKpis } from '@/lib/adminAnalyticsCache';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const kpis = await timeRouteHandler('GET /api/admin/dashboard-kpis', () =>
    getCachedAdminDashboardKpis()
  );
  return NextResponse.json(kpis);
}
