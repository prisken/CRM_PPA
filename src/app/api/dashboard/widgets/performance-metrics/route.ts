import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { buildPerformanceMetricsWidget } from '@/lib/standardDashboardWidgets';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const data = await buildPerformanceMetricsWidget(auth.user.id);
  return NextResponse.json(data);
}
