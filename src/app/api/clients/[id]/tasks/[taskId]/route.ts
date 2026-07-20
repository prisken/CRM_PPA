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

function formatTaskResponse(task: {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: { id: string; name: string | null; email: string } | null;
}) {
  return {
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
  };
}

async function validateAssigneeForClient(clientId: string, assigneeId: string | null) {
  if (!assigneeId) {
    return null;
  }

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

  return null;
}

async function getTaskForClient(clientId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId },
    select: { id: true, title: true },
  });

  if (!task) {
    return { error: NextResponse.json({ error: 'Task not found' }, { status: 404 }) };
  }

  return { task };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: clientId, taskId } = await params;
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

  const taskCheck = await getTaskForClient(clientId, taskId);
  if (taskCheck.error) {
    return taskCheck.error;
  }

  const body = await request.json();
  const title = body.title !== undefined ? body.title?.trim() : undefined;
  const description =
    body.description !== undefined ? body.description?.trim() || null : undefined;
  const status = body.status;
  const assigneeId =
    body.assigneeId !== undefined || body.assignee_id !== undefined
      ? body.assigneeId ?? body.assignee_id ?? null
      : undefined;

  if (title !== undefined && !title) {
    return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
  }

  if (status !== undefined && !Object.values(TaskStatus).includes(status)) {
    return NextResponse.json({ error: 'Invalid task status' }, { status: 400 });
  }

  const dueDateResult =
    body.dueDate !== undefined || body.due_date !== undefined
      ? parseDueDate(body.dueDate ?? body.due_date)
      : undefined;

  if (dueDateResult && 'error' in dueDateResult) {
    return NextResponse.json({ error: dueDateResult.error }, { status: 400 });
  }

  if (assigneeId !== undefined) {
    const assigneeError = await validateAssigneeForClient(clientId, assigneeId);
    if (assigneeError) {
      return assigneeError;
    }
  }

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(dueDateResult !== undefined && { dueDate: dueDateResult.value }),
      ...(assigneeId !== undefined && { assigneeId }),
    },
    include: {
      assignee: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  await logClientSystemEvent(
    clientId,
    `Task updated: ${updatedTask.title}`,
    auth.user.id
  );

  return NextResponse.json(formatTaskResponse(updatedTask));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: clientId, taskId } = await params;
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

  const taskCheck = await getTaskForClient(clientId, taskId);
  if (taskCheck.error) {
    return taskCheck.error;
  }

  const task = await prisma.task.delete({
    where: { id: taskId },
    select: { id: true, title: true },
  });

  await logClientSystemEvent(
    clientId,
    `Task deleted: ${task.title}`,
    auth.user.id
  );

  return NextResponse.json({ taskId: task.id, deleted: true });
}
