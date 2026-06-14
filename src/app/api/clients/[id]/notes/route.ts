import { InteractionType } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getClientOr404,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientAccess(clientId);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const body = await request.json();
  const content = body.content?.trim();

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const note = await prisma.interaction.create({
    data: {
      clientId,
      userId: auth.user.id,
      type: InteractionType.NOTE,
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
      id: note.id,
      type: note.type,
      content: note.content,
      date: note.date.toISOString(),
      source: 'manual',
      userName: note.user.name ?? note.user.email,
    },
    { status: 201 }
  );
}
