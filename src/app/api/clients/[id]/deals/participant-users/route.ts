import { UserStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  canUseDealParticipantPicker,
  getAuthenticatedUserFromRequest,
  getDealAccessForClient,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';
import { timeRouteHandler } from '@/lib/performance';

function getUserDisplayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const dealAccess = await getDealAccessForClient(
    auth.user.id,
    auth.user.role,
    clientId
  );

  if (!canUseDealParticipantPicker(auth.user.role, dealAccess)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await timeRouteHandler(
    'GET /api/clients/[id]/deals/participant-users',
    async () => {
      const rows = await prisma.user.findMany({
        where: { status: UserStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: [{ name: 'asc' }, { email: 'asc' }],
      });

      return rows.map((user) => ({
        user_id: user.id,
        userName: getUserDisplayName(user),
        email: user.email,
      }));
    },
    (result) => ({ clientId, userCount: result.length })
  );

  return NextResponse.json({ users });
}
