import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { buildStandardDashboard } from '@/lib/standardDashboard';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const dashboard = await buildStandardDashboard(auth.user.id);
  return NextResponse.json(dashboard);
}
