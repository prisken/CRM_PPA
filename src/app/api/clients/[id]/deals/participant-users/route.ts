import { UserStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  canAccessDealParticipantPicker,
  getAuthenticatedUserFromRequest,
} from '@/lib/authHelpers';
import { timeAsync, timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

function getUserDisplayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

export const dynamic = 'force-dynamic';

/**
 * Phase 2I.2: light picker gate — no getDealAccessForClient (admin no longer
 * enumerates all deal ids). Same allow-list as canUseDealParticipantPicker.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const auth = await timeAsync('client360:participantUsers:auth', () =>
    getAuthenticatedUserFromRequest(request)
  );
  if (auth.error) {
    return auth.error;
  }

  const allowed = await timeAsync('client360:participantUsers:access', () =>
    canAccessDealParticipantPicker(auth.user.id, auth.user.role, clientId)
  );
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await timeRouteHandler(
    `GET /api/clients/${clientId}/deals/participant-users`,
    async () => {
      return timeAsync(
        'client360:participantUsers',
        async () => {
          const rows = await timeAsync('client360:participantUsers:query', () =>
            prisma.user.findMany({
              where: { status: UserStatus.ACTIVE },
              select: {
                id: true,
                name: true,
                email: true,
              },
              orderBy: [{ name: 'asc' }, { email: 'asc' }],
            })
          );

          return timeAsync('client360:participantUsers:map', async () =>
            rows.map((user) => ({
              user_id: user.id,
              userName: getUserDisplayName(user),
              email: user.email,
            }))
          );
        },
        (result) => ({ clientId, userCount: result.length })
      );
    },
    (result) => ({ clientId, userCount: result.length })
  );

  return NextResponse.json({ users });
}
