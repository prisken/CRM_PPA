import { NextResponse } from 'next/server';
import { getCachedAdminRevenueTrackerData } from '@/lib/adminAnalyticsCache';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

type GroupBy = 'month' | 'quarter' | 'year';

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const groupBy = searchParams.get('groupBy') as GroupBy | null;

  if (!groupBy || !['month', 'quarter', 'year'].includes(groupBy)) {
    return NextResponse.json(
      { error: "Invalid groupBy parameter. Use 'month', 'quarter', or 'year'." },
      { status: 400 }
    );
  }

  const results = await timeRouteHandler(
    `GET /api/admin/revenue-tracker?groupBy=${groupBy}`,
    () => getCachedAdminRevenueTrackerData(groupBy)
  );
  return NextResponse.json(results);
}
