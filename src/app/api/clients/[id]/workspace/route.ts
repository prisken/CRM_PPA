import { NextResponse } from 'next/server';
import {
  buildActivityNotesWorkspace,
  buildStrategyTasksWorkspace,
  client360ActivityInclude,
  client360StrategyTasksInclude,
} from '@/lib/client360';
import { requireSuperAdminOrClientAccess } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

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

  const tab = new URL(request.url).searchParams.get('tab') ?? 'strategy-tasks';
  if (!VALID_TABS.has(tab)) {
    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
  }

  if (tab === 'strategy-tasks') {
    const payload = await timeRouteHandler(
      `GET /api/clients/${id}/workspace?tab=strategy-tasks`,
      async () => {
        const client = await prisma.client.findUnique({
          where: { id },
          include: client360StrategyTasksInclude,
        });

        if (!client) {
          return null;
        }

        return buildStrategyTasksWorkspace(client);
      },
      { payloadCategory: 'client360-core' }
    );

    if (!payload) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json(payload);
  }

  const payload = await timeRouteHandler(
    `GET /api/clients/${id}/workspace?tab=activity-notes`,
    async () => {
      const client = await prisma.client.findUnique({
        where: { id },
        include: client360ActivityInclude,
      });

      if (!client) {
        return null;
      }

      return buildActivityNotesWorkspace(client);
    },
    { payloadCategory: 'client360-core' }
  );

  if (!payload) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}
