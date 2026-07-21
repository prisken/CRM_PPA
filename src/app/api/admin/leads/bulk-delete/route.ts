import { ActivityLogType, ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  requireSuperAdminFromRequest,
  verifyAdminPassword,
} from '@/lib/authHelpers';
import { permanentlyDeleteClientRecords } from '@/lib/clientDeletion';
import { prisma } from '@/lib/prisma';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const MAX_CLIENT_IDS = 100;
const PERMANENT_CONFIRM_PHRASE = 'DELETE';

type BulkDeleteMode = 'archive' | 'permanent';

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

function parseMode(value: unknown): BulkDeleteMode | { error: string } {
  if (value === undefined || value === null || value === 'archive') {
    return 'archive';
  }

  if (value === 'permanent') {
    return 'permanent';
  }

  return { error: 'mode must be archive or permanent' };
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

  const body = await request.json().catch(() => ({}));
  const parsedClientIds = parseClientIds(body.clientIds);

  if ('error' in parsedClientIds) {
    return NextResponse.json({ error: parsedClientIds.error }, { status: 400 });
  }

  const parsedMode = parseMode(body.mode);
  if (typeof parsedMode !== 'string') {
    return NextResponse.json({ error: parsedMode.error }, { status: 400 });
  }

  const allClientsExist = await validateClientsExist(parsedClientIds);
  if (!allClientsExist) {
    return NextResponse.json(
      { error: 'One or more clients were not found' },
      { status: 400 }
    );
  }

  if (parsedMode === 'permanent') {
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPhrase =
      typeof body.confirmPhrase === 'string' ? body.confirmPhrase.trim() : '';

    if (confirmPhrase !== PERMANENT_CONFIRM_PHRASE) {
      return NextResponse.json(
        { error: `confirmPhrase must be ${PERMANENT_CONFIRM_PHRASE}` },
        { status: 400 }
      );
    }

    const passwordCheck = await verifyAdminPassword(auth.user.email, password);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 403 });
    }

    const payload = await timeRouteHandler(
      'POST /api/admin/leads/bulk-delete permanent',
      async () => {
        const count = await prisma.$transaction(async (tx) =>
          permanentlyDeleteClientRecords(tx, parsedClientIds)
        );

        return { ok: true as const, mode: 'permanent' as const, count };
      },
      (result) => ({
        mode: result.mode,
        count: result.count,
      })
    );

    return NextResponse.json(payload);
  }

  const payload = await timeRouteHandler(
    'POST /api/admin/leads/bulk-delete archive',
    async () => {
      const result = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.client.updateMany({
          where: {
            id: { in: parsedClientIds },
            status: { not: ClientStatus.ARCHIVED },
          },
          data: { status: ClientStatus.ARCHIVED },
        });

        if (updateResult.count > 0) {
          const archivedClients = await tx.client.findMany({
            where: {
              id: { in: parsedClientIds },
              status: ClientStatus.ARCHIVED,
            },
            select: { id: true },
          });

          await tx.clientActivityLog.createMany({
            data: archivedClients.map((client) => ({
              clientId: client.id,
              userId: auth.user.id,
              type: ActivityLogType.SYSTEM,
              content: 'Lead archived from Lead Command Center bulk delete.',
            })),
          });
        }

        return updateResult;
      });

      return { ok: true as const, mode: 'archive' as const, count: result.count };
    },
    (result) => ({
      mode: result.mode,
      count: result.count,
    })
  );

  return NextResponse.json(payload);
}
