import { AssignmentRole, TaskStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getClientOr404,
  logClientSystemEvent,
  requireSuperAdminOrClientRole,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

function parseDueDate(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }

  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    return { error: 'dueDate must be a valid date' };
  }

  return { value: parsed };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientRole(
    clientId,
    [AssignmentRole.DOCTOR],
    request
  );
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const body = await request.json();
  const title = body.title?.trim();
  const description = body.description?.trim() || null;
  const assigneeId = body.assigneeId ?? body.assignee_id ?? null;
  const status = body.status ?? TaskStatus.PENDING;

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  if (!Object.values(TaskStatus).includes(status)) {
    return NextResponse.json({ error: 'Invalid task status' }, { status: 400 });
  }

  const dueDateResult = parseDueDate(body.dueDate ?? body.due_date);
  if ('error' in dueDateResult) {
    return NextResponse.json({ error: dueDateResult.error }, { status: 400 });
  }

  if (assigneeId) {
    const assignment = await prisma.clientAssignment.findFirst({
      where: { clientId, userId: assigneeId },
      select: { assignmentId: true },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: 'Assignee must be a user assigned to this client' },
        { status: 400 }
      );
    }
  }

  const task = await prisma.task.create({
    data: {
      clientId,
      title,
      description,
      status,
      dueDate: dueDateResult.value,
      assigneeId,
    },
    include: {
      assignee: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  await logClientSystemEvent(
    clientId,
    `Task created: ${task.title}`,
    auth.user.id
  );

  return NextResponse.json(
    {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      dueDate: task.dueDate?.toISOString() ?? null,
      assignee: task.assignee
        ? {
            user_id: task.assignee.id,
            name: task.assignee.name ?? task.assignee.email,
          }
        : null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    },
    { status: 201 }
  );
}
