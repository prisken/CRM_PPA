import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';
import { buildPerformanceMetricsWidget } from '@/lib/standardDashboardWidgets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const data = await timeRouteHandler(
    'GET /api/dashboard/widgets/performance-metrics',
    () => buildPerformanceMetricsWidget(auth.user.id),
    { payloadCategory: 'dashboard-widget' }
  );
  return NextResponse.json(data);
}
