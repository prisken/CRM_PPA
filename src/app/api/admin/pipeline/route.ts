import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const payload = await timeRouteHandler(
    'GET /api/admin/pipeline',
    async () => {
      const clients = await prisma.client.findMany({
        select: {
          id: true,
          name: true,
          company: true,
          status: true,
          clientAssignments: {
            select: {
              role: true,
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        clients: clients.map((client) => ({
          client_id: client.id,
          name: client.name,
          company: client.company,
          status: client.status,
          assignedUsers: client.clientAssignments.map((assignment) => ({
            user_id: assignment.user.id,
            userName: assignment.user.name ?? assignment.user.email,
            role: assignment.role,
          })),
        })),
      };
    },
    {
      getMeta: (result) => ({
        clientCount: result.clients.length,
      }),
    }
  );

  return NextResponse.json(payload);
}
