import { AssignmentRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logClientSystemEvent, requireSuperAdmin } from '@/lib/authHelpers';
import {
  getRoleOccupancyLimitMessage,
} from '@/lib/constants';
import { recalculateReturnablesForUserOnClient } from '@/lib/commissionReturnables';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const userId = body.userId ?? body.user_id;
  const { role } = body;

  if (!userId || !role) {
    return NextResponse.json(
      { error: 'userId and role are required' },
      { status: 400 }
    );
  }

  if (!Object.values(AssignmentRole).includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const roleCount = await prisma.clientAssignment.count({
    where: { clientId, role },
  });

  const occupancyMessage = getRoleOccupancyLimitMessage(role, roleCount);
  if (occupancyMessage) {
    return NextResponse.json({ error: occupancyMessage }, { status: 400 });
  }

  const existing = await prisma.clientAssignment.findFirst({
    where: { clientId, userId, role },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'This user is already assigned with this role' },
      { status: 409 }
    );
  }

  const assignment = await prisma.clientAssignment.create({
    data: {
      clientId,
      userId,
      role,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  try {
    await recalculateReturnablesForUserOnClient(userId, clientId);
  } catch (error) {
    console.error(
      `Failed to recalculate commission returnables for user ${userId} on client ${clientId} after adding assignment.`,
      error
    );
  }

  await logClientSystemEvent(
    clientId,
    `${assignment.user.name ?? assignment.user.email} assigned as ${role}`,
    auth.user.id
  );

  return NextResponse.json(
    {
      assignment_id: assignment.assignmentId,
      user_id: assignment.user.id,
      userName: assignment.user.name ?? assignment.user.email,
      role: assignment.role,
    },
    { status: 201 }
  );
}
