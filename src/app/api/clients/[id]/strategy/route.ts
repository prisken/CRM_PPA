import { AssignmentRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getClientOr404,
  logClientSystemEvent,
  requireSuperAdminOrClientRole,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientRole(clientId, [
    AssignmentRole.DOCTOR,
  ]);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const body = await request.json();
  const strategyText = body.strategyText ?? body.strategy_text;

  if (strategyText === undefined) {
    return NextResponse.json(
      { error: 'strategyText is required' },
      { status: 400 }
    );
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      strategyText: typeof strategyText === 'string' ? strategyText : String(strategyText),
    },
    select: {
      id: true,
      strategyText: true,
      lastModified: true,
    },
  });

  await logClientSystemEvent(
    clientId,
    'Strategy updated',
    auth.user.id
  );

  return NextResponse.json({
    client_id: client.id,
    strategyText: client.strategyText ?? '',
    lastModified: client.lastModified.toISOString(),
  });
}
