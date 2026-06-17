import { ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  buildClient360CoreResponse,
  client360CoreInclude,
} from '@/lib/client360';
import {
  logClientSystemEvent,
  requireSuperAdminFromRequest,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

function normalizeConfirmName(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const confirmName = normalizeConfirmName(body.confirmName);

  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  if (confirmName !== existing.name) {
    return NextResponse.json(
      { error: 'Client name confirmation does not match' },
      { status: 400 }
    );
  }

  if (existing.status === ClientStatus.ARCHIVED) {
    return NextResponse.json(
      { error: 'Client is already archived' },
      { status: 400 }
    );
  }

  await prisma.client.update({
    where: { id },
    data: { status: ClientStatus.ARCHIVED },
  });

  await logClientSystemEvent(
    id,
    `Client archived by super admin (was ${existing.status})`,
    auth.user.id
  );

  const refreshedClient = await prisma.client.findUnique({
    where: { id },
    include: client360CoreInclude,
  });

  if (!refreshedClient) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(buildClient360CoreResponse(refreshedClient));
}
