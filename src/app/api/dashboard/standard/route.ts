import { NextResponse } from 'next/server';
import { requireStandardUser } from '@/lib/authHelpers';
import { buildStandardDashboard } from '@/lib/standardDashboard';

export async function GET(request: Request) {
  const auth = await requireStandardUser(request);
  if (auth.error) {
    return auth.error;
  }

  const dashboard = await buildStandardDashboard(auth.user.id);
  return NextResponse.json(dashboard);
}
