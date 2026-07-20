import {
  ActivityLogType,
  InteractionType,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getClientOr404,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MAX_CONTENT_LENGTH = 5000;

const INTERACTION_TYPES = new Set<string>([
  InteractionType.NOTE,
  InteractionType.CALL,
  InteractionType.EMAIL,
  InteractionType.MEETING,
]);

type QuickNoteMode = 'interaction' | 'system';

function parseMode(value: unknown): QuickNoteMode | null {
  if (value === undefined || value === null || value === '') {
    return 'interaction';
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const body = await request.json();
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

  if (mode === 'system') {
    const activityLog = await prisma.clientActivityLog.create({
      data: {
        clientId,
        userId: auth.user.id,
        type: ActivityLogType.SYSTEM,
        content: rawContent,
      },
      select: {
        id: true,
        clientId: true,
        content: true,
        type: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        note: {
          id: activityLog.id,
          clientId: activityLog.clientId,
          content: activityLog.content,
          type: activityLog.type,
          mode: 'system' as const,
          createdAt: activityLog.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  }

  const interaction = await prisma.interaction.create({
    data: {
      clientId,
      userId: auth.user.id,
      type: interactionType,
      content: rawContent,
    },
    select: {
      id: true,
      clientId: true,
      content: true,
      type: true,
      date: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      note: {
        id: interaction.id,
        clientId: interaction.clientId,
        content: interaction.content,
        type: interaction.type,
        mode: 'interaction' as const,
        createdAt: interaction.date.toISOString(),
      },
    },
    { status: 201 }
  );
}
