import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';
import { buildOpenTasksWidget } from '@/lib/standardDashboardWidgets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const data = await timeRouteHandler('GET /api/dashboard/widgets/open-tasks', () =>
    buildOpenTasksWidget(auth.user.id)
  );
  return NextResponse.json(data);
}
