import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { buildAssignedClientsWidget } from '@/lib/standardDashboardWidgets';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const data = await buildAssignedClientsWidget(auth.user.id);
  return NextResponse.json(data);
}
