import { ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { buildClient360Response, client360Include } from '@/lib/client360';
import { prisma } from '@/lib/prisma';
import {
  authorizePipelineStatusChange,
  getAuthenticatedUser,
} from '@/lib/authHelpers';

const PATCH_CLIENT_NON_STATUS_FIELDS = [
  'name',
  'company',
  'contactInfo',
  'email',
  'phone',
  'lead_source',
  'deal_value',
  'equity',
  'strategyText',
] as const;

function hasNonStatusUpdates(body: Record<string, unknown>) {
  return PATCH_CLIENT_NON_STATUS_FIELDS.some((field) => body[field] !== undefined);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth.error;
  }

  const client = await prisma.client.findUnique({
    where: { id },
    include: client360Include,
  });

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(buildClient360Response(client));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const {
    name,
    company,
    contactInfo,
    email,
    phone,
    lead_source,
    deal_value,
    equity,
    strategyText,
    status,
  } = body;

  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  if (status && !Object.values(ClientStatus).includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const isStatusChange = status !== undefined && status !== existing.status;

  if (auth.user.role !== 'SUPER_ADMIN') {
    if (hasNonStatusUpdates(body)) {
      return NextResponse.json(
        { error: 'Only super admins can update other client fields' },
        { status: 403 }
      );
    }

    if (!isStatusChange) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const statusAuth = await authorizePipelineStatusChange(
      auth.user.id,
      auth.user.role,
      id,
      existing.status
    );

    if (!statusAuth.authorized) {
      return statusAuth.error;
    }
  }

  const client = await prisma.client.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(company !== undefined && { company: company?.trim() || null }),
      ...(contactInfo !== undefined && { contactInfo: contactInfo?.trim() || null }),
      ...(email !== undefined && { email: email?.trim() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(lead_source !== undefined && { leadSource: lead_source?.trim() || null }),
      ...(deal_value !== undefined && {
        dealValue: deal_value === null || deal_value === '' ? null : deal_value,
      }),
      ...(equity !== undefined && {
        equity: equity === null || equity === '' ? null : equity,
      }),
      ...(strategyText !== undefined && { strategyText: strategyText?.trim() || null }),
      ...(status !== undefined && { status }),
    },
  });

  if (status !== undefined && status !== existing.status) {
    await prisma.clientActivityLog.create({
      data: {
        clientId: id,
        type: 'SYSTEM',
        content: `Pipeline stage changed from ${existing.status} to ${status}`,
        userId: auth.user.id,
      },
    });
  }

  const refreshedClient = await prisma.client.findUnique({
    where: { id },
    include: client360Include,
  });

  if (!refreshedClient) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(buildClient360Response(refreshedClient));
}
