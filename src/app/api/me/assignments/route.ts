import { AssignmentRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const payload = await timeRouteHandler(
    'GET /api/me/assignments',
    async () => {
      const assignments = await prisma.clientAssignment.findMany({
        where: { userId: auth.user.id },
        select: {
          assignmentId: true,
          clientId: true,
          role: true,
          client: {
            select: {
              name: true,
              company: true,
              status: true,
            },
          },
        },
        orderBy: { client: { name: 'asc' } },
      });

      const roles = [...new Set(assignments.map((assignment) => assignment.role))];

      return {
        assignments: assignments.map((assignment) => ({
          assignment_id: assignment.assignmentId,
          client_id: assignment.clientId,
          clientName: assignment.client.company ?? assignment.client.name,
          clientStatus: assignment.client.status,
          role: assignment.role,
        })),
        roles,
        hasAnyAssignment: assignments.length > 0,
        hasDoctorRole: roles.includes(AssignmentRole.DOCTOR),
        hasRelationshipRole: roles.includes(AssignmentRole.RELATIONSHIP),
      };
    },
    {
      getMeta: (result) => ({
        assignmentCount: result.assignments.length,
        hasDoctorRole: result.hasDoctorRole,
      }),
    }
  );

  return NextResponse.json(payload);
}
