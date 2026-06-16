import { NextResponse } from 'next/server';
import {
  authorizeInteractionOwner,
  getAuthenticatedUser,
  getClientOr404,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

async function getInteractionForClient(clientId: string, interactionId: string) {
  const interaction = await prisma.interaction.findFirst({
    where: { id: interactionId, clientId },
    select: {
      id: true,
      userId: true,
      type: true,
      content: true,
      date: true,
    },
  });

  if (!interaction) {
    return { error: NextResponse.json({ error: 'Interaction not found' }, { status: 404 }) };
  }

  return { interaction };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; interactionId: string }> }
) {
  const { id: clientId, interactionId } = await params;
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const interactionCheck = await getInteractionForClient(clientId, interactionId);
  if (interactionCheck.error) {
    return interactionCheck.error;
  }

  const ownerAuth = authorizeInteractionOwner(
    auth.user.id,
    auth.user.role,
    interactionCheck.interaction.userId
  );
  if (!ownerAuth.authorized) {
    return ownerAuth.error;
  }

  const body = await request.json();
  const content = body.content?.trim();

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const updatedInteraction = await prisma.interaction.update({
    where: { id: interactionId },
    data: { content },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  });

  return NextResponse.json({
    id: updatedInteraction.id,
    type: updatedInteraction.type,
    content: updatedInteraction.content,
    date: updatedInteraction.date.toISOString(),
    source: 'manual',
    userId: updatedInteraction.userId,
    userName: updatedInteraction.user.name ?? updatedInteraction.user.email,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; interactionId: string }> }
) {
  const { id: clientId, interactionId } = await params;
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const interactionCheck = await getInteractionForClient(clientId, interactionId);
  if (interactionCheck.error) {
    return interactionCheck.error;
  }

  const ownerAuth = authorizeInteractionOwner(
    auth.user.id,
    auth.user.role,
    interactionCheck.interaction.userId
  );
  if (!ownerAuth.authorized) {
    return ownerAuth.error;
  }

  await prisma.interaction.delete({
    where: { id: interactionId },
  });

  return NextResponse.json({ interactionId, deleted: true });
}
