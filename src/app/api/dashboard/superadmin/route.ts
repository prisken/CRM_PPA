import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';
import { buildSuperAdminDashboard } from '@/lib/superAdminDashboard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const dashboard = await timeRouteHandler('GET /api/dashboard/superadmin', () =>
    buildSuperAdminDashboard(auth.user.id)
  );
  return NextResponse.json(dashboard);
}
