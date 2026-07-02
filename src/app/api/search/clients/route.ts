import { UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { searchClients } from '@/lib/leadCommandCenter';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const MAX_RESULTS = 10;

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';

  if (!query) {
    return NextResponse.json({ clients: [] });
  }

  const isSuperAdmin = auth.user.role === UserRole.SUPER_ADMIN;

  const payload = await timeRouteHandler(
    'GET /api/search/clients',
    () =>
      searchClients({
        query,
        assignedUserId: isSuperAdmin ? undefined : auth.user.id,
        limit: MAX_RESULTS,
      }),
    (clients) => ({
      queryLength: query.length,
      resultCount: clients.length,
      scopedToAssignments: !isSuperAdmin,
    })
  );

  return NextResponse.json({ clients: payload });
}
