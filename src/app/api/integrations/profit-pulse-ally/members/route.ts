import { LeadSourceType } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { ingestExternalLead } from '@/lib/leadIngestion';
import { compactString, normalizeEmail } from '@/lib/leadNormalization';

export const dynamic = 'force-dynamic';

const DEFAULT_LEAD_SOURCE = 'Profit Pulse Ally Member Signup';

type ProfitPulseAllyMemberBody = {
  email?: unknown;
  name?: unknown;
  fullName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  contactNumber?: unknown;
  phone?: unknown;
  company?: unknown;
  roleInCompany?: unknown;
  role?: unknown;
  expectations?: unknown;
  memberId?: unknown;
  signedUpAt?: unknown;
  provider?: unknown;
  source?: unknown;
};

function resolveLeadSource(body: ProfitPulseAllyMemberBody): string {
  const source = compactString(body.source);
  if (source) {
    return source;
  }

  if (compactString(body.provider) === 'Hub Cards') {
    return 'Hub Cards';
  }

  return DEFAULT_LEAD_SOURCE;
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

function resolveName(body: ProfitPulseAllyMemberBody) {
  const directName = compactString(body.name) ?? compactString(body.fullName);
  if (directName) {
    return directName;
  }

  const firstName = compactString(body.firstName);
  const lastName = compactString(body.lastName);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return combinedName || null;
}

function resolvePhone(body: ProfitPulseAllyMemberBody) {
  return compactString(body.phone) ?? compactString(body.contactNumber);
}

function buildContactInfo(body: ProfitPulseAllyMemberBody) {
  const lines: string[] = [];
  const memberId = stringifyField(body.memberId);
  const signedUpAt = stringifyField(body.signedUpAt);
  const provider = stringifyField(body.provider);

  if (memberId) {
    lines.push(`Member ID: ${memberId}`);
  }
  if (signedUpAt) {
    lines.push(`Signed up at: ${signedUpAt}`);
  }
  if (provider) {
    lines.push(`Provider: ${provider}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
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

  const email = normalizeEmail(
    typeof body.email === 'string' ? body.email : null
  );
  const phone = resolvePhone(body);

  // Phone-first funnels (e.g. Hub Cards recruit form) legitimately have no
  // email field — accept a lead with at least one contact channel.
  if (!email && !phone) {
    return NextResponse.json(
      { error: 'email or phone required' },
      { status: 400 }
    );
  }

  try {
    const result = await ingestExternalLead({
      source: LeadSourceType.PROFIT_PULSE_ALLY,
      externalId: stringifyField(body.memberId),
      payload: body,
      defaultLeadSource: DEFAULT_LEAD_SOURCE,
      lead: {
        name: resolveName(body),
        email,
        phone,
        company: compactString(body.company),
        leadSource: resolveLeadSource(body),
        roleInCompany:
          compactString(body.roleInCompany) ?? compactString(body.role),
        expectations: compactString(body.expectations),
        contactInfo: buildContactInfo(body),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        action: result.action,
        clientId: result.clientId,
        matchedBy: result.matchedBy,
      },
      { status: result.action === 'created' ? 201 : 200 }
    );
  } catch (err) {
    console.error('[profit-pulse-ally] Failed to upsert member from webhook', err);

    return NextResponse.json(
      { error: 'Failed to save member lead', detail: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
