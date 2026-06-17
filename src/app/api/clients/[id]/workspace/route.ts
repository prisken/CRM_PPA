import { NextResponse } from 'next/server';
import {
  buildActivityNotesWorkspace,
  buildStrategyTasksWorkspace,
  client360ActivityInclude,
  client360StrategyTasksInclude,
} from '@/lib/client360';
import { getClientOr404, requireSuperAdminOrClientAccess } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

const VALID_TABS = new Set(['strategy-tasks', 'activity', 'activity-notes']);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireSuperAdminOrClientAccess(id);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(id);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const tab = new URL(request.url).searchParams.get('tab') ?? 'strategy-tasks';
  if (!VALID_TABS.has(tab)) {
    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
  }

  if (tab === 'strategy-tasks') {
    const client = await prisma.client.findUnique({
      where: { id },
      include: client360StrategyTasksInclude,
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json(buildStrategyTasksWorkspace(client));
  }

  const client = await prisma.client.findUnique({
    where: { id },
    include: client360ActivityInclude,
  });

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(buildActivityNotesWorkspace(client));
}
