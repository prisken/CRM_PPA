import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { buildSuperAdminDashboard } from '@/lib/superAdminDashboard';

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const dashboard = await buildSuperAdminDashboard(auth.user.id);
  return NextResponse.json(dashboard);
}
