import {
  ActivityLogType,
  AssignmentRole,
  UserStatus,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { scheduleReturnableRecalculation } from '@/lib/commissionReturnables';
import { prisma } from '@/lib/prisma';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const MAX_CLIENT_IDS = 100;
const RELATIONSHIP_ROLE = AssignmentRole.RELATIONSHIP;
const ACTIVITY_CONTENT =
  'Relationship owner assigned from Lead Command Center.';
const SKIP_REASON_HAS_RELATIONSHIP = 'Client already has a relationship owner';

function parseClientIds(value: unknown): string[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: 'clientIds must be a non-empty array' };
  }

  const clientIds = [
    ...new Set(
      value
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];

  if (clientIds.length === 0) {
    return { error: 'clientIds must be a non-empty array' };
  }

  if (clientIds.length > MAX_CLIENT_IDS) {
    return { error: `clientIds must contain at most ${MAX_CLIENT_IDS} items` };
  }

  return clientIds;
}

function parseUserId(value: unknown): { userId: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: 'userId is required' };
  }

  return { userId: value.trim() };
}

async function validateClientsExist(clientIds: string[]) {
  const existingClients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true },
  });

  return existingClients.length === clientIds.length;
}

export async function POST(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsedClientIds = parseClientIds(body.clientIds);

  if ('error' in parsedClientIds) {
    return NextResponse.json({ error: parsedClientIds.error }, { status: 400 });
  }

  const parsedUserId = parseUserId(body.userId);
  if ('error' in parsedUserId) {
    return NextResponse.json({ error: parsedUserId.error }, { status: 400 });
  }

  const { userId } = parsedUserId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 400 });
  }

  if (user.status !== UserStatus.ACTIVE) {
    return NextResponse.json(
      { error: 'User must be active' },
      { status: 400 }
    );
  }

  const allClientsExist = await validateClientsExist(parsedClientIds);
  if (!allClientsExist) {
    return NextResponse.json(
      { error: 'One or more clients were not found' },
      { status: 400 }
    );
  }

  const existingRelationshipAssignments = await prisma.clientAssignment.findMany({
    where: {
      clientId: { in: parsedClientIds },
      role: RELATIONSHIP_ROLE,
    },
    select: { clientId: true },
  });

  const clientsWithRelationship = new Set(
    existingRelationshipAssignments.map((assignment) => assignment.clientId)
  );

  const skipped: { clientId: string; reason: string }[] = [];
  const clientIdsToAssign: string[] = [];

  for (const clientId of parsedClientIds) {
    if (clientsWithRelationship.has(clientId)) {
      skipped.push({
        clientId,
        reason: SKIP_REASON_HAS_RELATIONSHIP,
      });
      continue;
    }

    clientIdsToAssign.push(clientId);
  }

  const payload = await timeRouteHandler(
    'POST /api/admin/leads/bulk-assign-relationship',
    async () => {
      let assignedCount = 0;

      if (clientIdsToAssign.length > 0) {
        const result = await prisma.$transaction(async (tx) => {
          const assignmentResult = await tx.clientAssignment.createMany({
            data: clientIdsToAssign.map((clientId) => ({
              clientId,
              userId,
              role: RELATIONSHIP_ROLE,
            })),
          });

          await tx.clientActivityLog.createMany({
            data: clientIdsToAssign.map((clientId) => ({
              clientId,
              userId: auth.user.id,
              type: ActivityLogType.SYSTEM,
              content: ACTIVITY_CONTENT,
            })),
          });

          return assignmentResult;
        });

        assignedCount = result.count;

        for (const clientId of clientIdsToAssign) {
          scheduleReturnableRecalculation(userId, clientId, request);
        }
      }

      return {
        ok: true as const,
        assignedCount,
        skipped,
      };
    },
    (result) => ({
      assignedCount: result.assignedCount,
      skippedCount: result.skipped.length,
    })
  );

  return NextResponse.json(payload);
}
