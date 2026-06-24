import { NextResponse } from 'next/server';
import { logClientSystemEvent, requireSuperAdmin } from '@/lib/authHelpers';
import { scheduleReturnableRecalculation } from '@/lib/commissionReturnables';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const { id: clientId, assignmentId } = await params;
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const assignment = await prisma.clientAssignment.findUnique({
    where: { assignmentId },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  });

  if (!assignment || assignment.clientId !== clientId) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  const userId = assignment.userId;

  await prisma.clientAssignment.delete({
    where: { assignmentId },
  });

  scheduleReturnableRecalculation(userId, clientId, request);

  await logClientSystemEvent(
    clientId,
    `${assignment.user.name ?? assignment.user.email} removed from team (${assignment.role})`,
    auth.user.id
  );

  return NextResponse.json({ success: true });
}
