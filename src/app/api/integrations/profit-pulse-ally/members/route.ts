import { ClientStatus } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DEFAULT_LEAD_SOURCE = 'Profit Pulse Ally Member Signup';
const PPA_CONTACT_INFO_MARKER = '[Profit Pulse Ally]';

type ProfitPulseAllyMemberBody = {
  email?: unknown;
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  contactNumber?: unknown;
  phone?: unknown;
  source?: unknown;
  memberId?: unknown;
  signedUpAt?: unknown;
  provider?: unknown;
  role?: unknown;
};

function trimOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringifyField(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const asString = String(value).trim();
  return asString ? asString : null;
}

function isWebhookSecretValid(provided: string | null, expected: string) {
  if (!provided) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function resolveName(body: ProfitPulseAllyMemberBody) {
  const directName = trimOrNull(body.name);
  if (directName) {
    return directName;
  }

  const firstName = trimOrNull(body.firstName);
  const lastName = trimOrNull(body.lastName);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();

  if (combinedName) {
    return combinedName;
  }

  return null;
}

function resolvePhone(body: ProfitPulseAllyMemberBody) {
  return trimOrNull(body.contactNumber) ?? trimOrNull(body.phone);
}

function buildPpaContactInfo(fields: {
  memberId: string | null;
  signedUpAt: string | null;
  provider: string | null;
  role: string | null;
}) {
  const lines = [PPA_CONTACT_INFO_MARKER];

  if (fields.memberId) {
    lines.push(`memberId: ${fields.memberId}`);
  }
  if (fields.signedUpAt) {
    lines.push(`signedUpAt: ${fields.signedUpAt}`);
  }
  if (fields.provider) {
    lines.push(`provider: ${fields.provider}`);
  }
  if (fields.role) {
    lines.push(`role: ${fields.role}`);
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function mergeContactInfo(existing: string | null, incoming: string | null) {
  if (!incoming) {
    return existing;
  }

  if (!existing) {
    return incoming;
  }

  const withoutExistingBlock = existing
    .replace(new RegExp(`${PPA_CONTACT_INFO_MARKER}[\\s\\S]*?(?=\\n\\[|$)`), '')
    .trim();

  return withoutExistingBlock ? `${withoutExistingBlock}\n\n${incoming}` : incoming;
}

function buildUpsertFields(body: ProfitPulseAllyMemberBody, email: string) {
  const name = resolveName(body);
  const phone = resolvePhone(body);
  const leadSource = trimOrNull(body.source) ?? DEFAULT_LEAD_SOURCE;
  const roleInCompany = trimOrNull(body.role);
  const memberId = stringifyField(body.memberId);
  const signedUpAt = stringifyField(body.signedUpAt);
  const provider = stringifyField(body.provider);

  const contactInfo = buildPpaContactInfo({
    memberId,
    signedUpAt,
    provider,
    role: roleInCompany ? null : trimOrNull(body.role),
  });

  return {
    email,
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    leadSource,
    ...(roleInCompany ? { roleInCompany } : {}),
    ...(contactInfo ? { contactInfo } : {}),
  };
}

export async function GET() {
  return Response.json({ ok: true, route: 'profit-pulse-ally-members' });
}

export async function POST(request: Request) {
  const expectedSecret = process.env.PROFIT_PULSE_ALLY_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: 'Webhook is not configured' },
      { status: 500 }
    );
  }

  const providedSecret = request.headers.get('x-webhook-secret');

  if (!providedSecret) {
    return NextResponse.json(
      { error: 'Missing x-webhook-secret header' },
      { status: 401 }
    );
  }

  if (!isWebhookSecretValid(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
  }

  let body: ProfitPulseAllyMemberBody;

  try {
    body = (await request.json()) as ProfitPulseAllyMemberBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const upsertFields = buildUpsertFields(body, email);

  try {
    const existingClient = await prisma.client.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
        contactInfo: true,
      },
    });

    if (existingClient) {
      const updateData = {
        email,
        ...(upsertFields.name ? { name: upsertFields.name } : {}),
        ...(upsertFields.phone ? { phone: upsertFields.phone } : {}),
        leadSource: upsertFields.leadSource,
        ...(upsertFields.roleInCompany
          ? { roleInCompany: upsertFields.roleInCompany }
          : {}),
        ...(upsertFields.contactInfo
          ? {
              contactInfo: mergeContactInfo(
                existingClient.contactInfo,
                upsertFields.contactInfo
              ),
            }
          : {}),
      };

      await prisma.client.update({
        where: { id: existingClient.id },
        data: updateData,
      });

      return NextResponse.json({ ok: true, action: 'updated' });
    }

    await prisma.client.create({
      data: {
        name: upsertFields.name ?? (email.split('@')[0] || 'Member'),
        email,
        phone: upsertFields.phone ?? null,
        leadSource: upsertFields.leadSource,
        roleInCompany: upsertFields.roleInCompany ?? null,
        contactInfo: upsertFields.contactInfo ?? null,
        status: ClientStatus.NEW_LEAD,
      },
    });

    return NextResponse.json({ ok: true, action: 'created' }, { status: 201 });
  } catch {
    console.error('[profit-pulse-ally] Failed to upsert member from webhook');

    return NextResponse.json(
      { error: 'Failed to save member lead' },
      { status: 500 }
    );
  }
}
