import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';
import { buildStandardDashboard } from '@/lib/standardDashboard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const dashboard = await timeRouteHandler(
    'GET /api/dashboard/standard',
    () => buildStandardDashboard(auth.user.id),
    { payloadCategory: 'dashboard-widget' }
  );
  return NextResponse.json(dashboard);
}
