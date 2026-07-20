import { InteractionType } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getClientOr404,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

const MANUAL_INTERACTION_TYPES = [
  InteractionType.NOTE,
  InteractionType.CALL,
  InteractionType.EMAIL,
  InteractionType.MEETING,
] as const;

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
  const content = body.content?.trim();
  const type = body.type ?? InteractionType.NOTE;

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  if (!MANUAL_INTERACTION_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid interaction type' }, { status: 400 });
  }

  const interaction = await prisma.interaction.create({
    data: {
      clientId,
      userId: auth.user.id,
      type,
      content,
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  });

  return NextResponse.json(
    {
      id: interaction.id,
      type: interaction.type,
      content: interaction.content,
      date: interaction.date.toISOString(),
      source: 'manual',
      userId: interaction.userId,
      userName: interaction.user.name ?? interaction.user.email,
    },
    { status: 201 }
  );
}
