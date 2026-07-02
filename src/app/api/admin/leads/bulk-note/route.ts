import {
  ActivityLogType,
  InteractionType,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const MAX_CLIENT_IDS = 100;
const MAX_CONTENT_LENGTH = 5000;

const INTERACTION_TYPES = new Set<string>([
  InteractionType.NOTE,
  InteractionType.CALL,
  InteractionType.EMAIL,
  InteractionType.MEETING,
]);

type BulkNoteMode = 'interaction' | 'system';

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

function parseMode(value: unknown): BulkNoteMode | null {
  if (value === undefined || value === null || value === '') {
    return 'system';
  }

  if (value === 'interaction' || value === 'system') {
    return value;
  }

  return null;
}

function parseInteractionType(value: unknown): InteractionType {
  if (typeof value !== 'string' || !INTERACTION_TYPES.has(value)) {
    return InteractionType.NOTE;
  }

  return value as InteractionType;
}

async function validateClientsExist(clientIds: string[]) {
  const existingClients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true },
  });

  if (existingClients.length !== clientIds.length) {
    return false;
  }

  return true;
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

  const rawContent = typeof body.content === 'string' ? body.content.trim() : '';
  const mode = parseMode(body.mode);
  const interactionType = parseInteractionType(body.type);

  if (!rawContent) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  if (rawContent.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `content must be at most ${MAX_CONTENT_LENGTH} characters` },
      { status: 400 }
    );
  }

  if (mode === null) {
    return NextResponse.json(
      { error: 'mode must be interaction or system' },
      { status: 400 }
    );
  }

  if (body.type !== undefined && body.type !== null && body.type !== '') {
    if (typeof body.type !== 'string' || !INTERACTION_TYPES.has(body.type)) {
      return NextResponse.json(
        { error: 'type must be NOTE, CALL, EMAIL, or MEETING' },
        { status: 400 }
      );
    }
  }

  const allClientsExist = await validateClientsExist(parsedClientIds);
  if (!allClientsExist) {
    return NextResponse.json(
      { error: 'One or more clients were not found' },
      { status: 400 }
    );
  }

  const payload = await timeRouteHandler(
    'POST /api/admin/leads/bulk-note',
    async () => {
      if (mode === 'interaction') {
        const result = await prisma.interaction.createMany({
          data: parsedClientIds.map((clientId) => ({
            clientId,
            userId: auth.user.id,
            type: interactionType,
            content: rawContent,
          })),
        });

        return { ok: true as const, count: result.count };
      }

      const result = await prisma.clientActivityLog.createMany({
        data: parsedClientIds.map((clientId) => ({
          clientId,
          userId: auth.user.id,
          type: ActivityLogType.SYSTEM,
          content: rawContent,
        })),
      });

      return { ok: true as const, count: result.count };
    },
    (result) => ({
      mode,
      count: result.count,
    })
  );

  return NextResponse.json(payload, { status: 201 });
}
