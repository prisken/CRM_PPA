import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';
import {
  buildOpenTasksWidget,
  OPEN_TASKS_LIMIT,
} from '@/lib/standardDashboardWidgets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const data = await timeRouteHandler(
    'GET /api/dashboard/widgets/open-tasks',
    () => buildOpenTasksWidget(auth.user.id),
    {
      payloadCategory: 'dashboard-widget',
      getMeta: (result) => ({
        taskCount: result.openTasks.length,
        take: OPEN_TASKS_LIMIT,
      }),
    }
  );
  return NextResponse.json(data);
}
