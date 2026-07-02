import { ActivityLogType, ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { formatClientStage } from '@/lib/clientStages';
import { prisma } from '@/lib/prisma';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const MAX_CLIENT_IDS = 100;

const VALID_STATUSES = new Set<string>(Object.values(ClientStatus));

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

function parseStatus(value: unknown): { status: ClientStatus } | { error: string } {
  if (typeof value !== 'string' || !VALID_STATUSES.has(value)) {
    return {
      error:
        'status must be NEW_LEAD, CONTACTED, NURTURING, STRATEGY_SESSION, ACTIVE_CLIENT, or ARCHIVED',
    };
  }

  return { status: value as ClientStatus };
}

async function validateClientsExist(clientIds: string[]) {
  const existingClients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true },
  });

  return existingClients.length === clientIds.length;
}

export async function PATCH(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsedClientIds = parseClientIds(body.clientIds);

  if ('error' in parsedClientIds) {
    return NextResponse.json({ error: parsedClientIds.error }, { status: 400 });
  }

  const parsedStatus = parseStatus(body.status);
  if ('error' in parsedStatus) {
    return NextResponse.json({ error: parsedStatus.error }, { status: 400 });
  }

  const { status } = parsedStatus;

  const allClientsExist = await validateClientsExist(parsedClientIds);
  if (!allClientsExist) {
    return NextResponse.json(
      { error: 'One or more clients were not found' },
      { status: 400 }
    );
  }

  const statusLabel = formatClientStage(status);
  const activityContent = `Status changed to ${statusLabel} from Lead Command Center.`;

  const payload = await timeRouteHandler(
    'PATCH /api/admin/leads/bulk-status',
    async () => {
      const result = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.client.updateMany({
          where: { id: { in: parsedClientIds } },
          data: { status },
        });

        await tx.clientActivityLog.createMany({
          data: parsedClientIds.map((clientId) => ({
            clientId,
            userId: auth.user.id,
            type: ActivityLogType.SYSTEM,
            content: activityContent,
          })),
        });

        return updateResult;
      });

      return { ok: true as const, count: result.count };
    },
    (result) => ({
      status,
      count: result.count,
    })
  );

  return NextResponse.json(payload);
}
