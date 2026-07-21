import { ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  buildClient360CoreResponse,
  client360CoreQuerySelect,
} from '@/lib/client360';
import { permanentlyDeleteClientRecords } from '@/lib/clientDeletion';
import { replaceClientContacts } from '@/lib/clientContacts';
import { prisma } from '@/lib/prisma';
import {
  authorizePipelineStatusChange,
  canReadClientCore,
  getAuthenticatedUserFromRequest,
  requireSuperAdminFromRequest,
  verifyAdminPassword,
} from '@/lib/authHelpers';
import { timeAsync, timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await timeAsync('client360:core:auth', () =>
    getAuthenticatedUserFromRequest(request)
  );
  if (auth.error) {
    return auth.error;
  }

  const allowed = await timeAsync('client360:core:access', () =>
    canReadClientCore(auth.user.id, auth.user.role, id)
  );
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = await timeRouteHandler(
    `GET /api/clients/${id}`,
    async () => {
      const client = await timeAsync('client360:core:query', () =>
        prisma.client.findUnique({
          where: { id },
          // Narrow select — same as RSC / core-slice refresh (no documents/strategies joins).
          select: client360CoreQuerySelect,
        })
      );

      if (!client) {
        return null;
      }

      return timeAsync('client360:core:map', async () =>
        buildClient360CoreResponse(client)
      );
    },
    {
      payloadCategory: 'client360-core',
      getMeta: (result) => ({ found: result !== null }),
    }
  );

  if (!payload) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUserFromRequest(request);
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

  const client = await prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(company !== undefined && { company: company?.trim() || null }),
        ...(contactInfo !== undefined && {
          contactInfo: contactInfo?.trim() || null,
        }),
        ...(lead_source !== undefined && {
          leadSource: lead_source?.trim() || null,
        }),
        ...(deal_value !== undefined && {
          dealValue: deal_value === null || deal_value === '' ? null : deal_value,
        }),
        ...(equity !== undefined && {
          equity: equity === null || equity === '' ? null : equity,
        }),
        ...(strategyText !== undefined && {
          strategyText: strategyText?.trim() || null,
        }),
        ...(status !== undefined && { status }),
      },
    });

    if (email !== undefined || phone !== undefined) {
      await replaceClientContacts(tx, id, {
        emails:
          email !== undefined ? (email?.trim() ? [email.trim()] : []) : undefined,
        phones:
          phone !== undefined ? (phone?.trim() ? [phone.trim()] : []) : undefined,
      });
    }

    return updated;
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
    where: { id: client.id },
    // Same narrow core DTO as GET — keeps Phase 2A stage refresh consistent.
    select: client360CoreQuerySelect,
  });

  if (!refreshedClient) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(buildClient360CoreResponse(refreshedClient));
}

function normalizeConfirmName(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
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

  const passwordCheck = await verifyAdminPassword(auth.user.email, password);
  if (!passwordCheck.valid) {
    return NextResponse.json(
      { error: passwordCheck.error },
      { status: 403 }
    );
  }

  await permanentlyDeleteClientRecords(prisma, id);

  return NextResponse.json({ success: true, client_id: id });
}
