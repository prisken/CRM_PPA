import { TaskStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  hasClientAssignment,
  logClientSystemEvent,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth.error;
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      clientId: true,
      assigneeId: true,
      status: true,
    },
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const isAssignee = task.assigneeId === auth.user.id;
  const isSuperAdmin = auth.user.role === UserRole.SUPER_ADMIN;
  const hasAccess =
    isAssignee ||
    isSuperAdmin ||
    (await hasClientAssignment(auth.user.id, task.clientId));

  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (task.status === TaskStatus.COMPLETED) {
    return NextResponse.json({
      taskId: task.id,
      status: TaskStatus.COMPLETED,
    });
  }

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: { status: TaskStatus.COMPLETED },
    select: {
      id: true,
      status: true,
      title: true,
      clientId: true,
    },
  });

  await logClientSystemEvent(
    task.clientId,
    `Task completed: ${task.title}`,
    auth.user.id
  );

  return NextResponse.json({
    taskId: updatedTask.id,
    status: updatedTask.status,
    clientId: updatedTask.clientId,
  });
}
