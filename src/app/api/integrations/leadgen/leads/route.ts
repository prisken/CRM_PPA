import { LeadSourceType } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { ingestExternalLead } from '@/lib/leadIngestion';
import { compactString } from '@/lib/leadNormalization';

export const dynamic = 'force-dynamic';

/**
 * LeadGen intake webhook — n8n → CRM.
 *
 * Shares the exact pattern of the Google Forms / PPA members webhooks:
 * shared-secret auth (x-webhook-secret), dedupe by externalId/email/phone,
 * upsert into Client, activity log, source record.
 *
 * Secret: CRM_WEBHOOK_SECRET (already set in Vercel env).
 *
 * POST /api/integrations/leadgen/leads
 * Headers: x-webhook-secret: <CRM_WEBHOOK_SECRET>
 * Body:
 *   name           (string, optional if company provided — falls back to company)
 *   email / phone  (at least one of name|company|email|phone required)
 *   company        (string, optional — corporate grouping key)
 *   roleInCompany  (string, optional)
 *   employeeCount  (number|string, optional)
 *   expectations   (string, optional)
 *   contactInfo    (string, optional)
 *   leadSource     (string, optional — default "Group Medical - Cold")
 *   externalId     (string, optional — dedupe key for this source)
 */

const DEFAULT_LEAD_SOURCE = 'Group Medical - Cold';

type LeadGenBody = {
  name?: unknown;
  fullName?: unknown;
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  contactNumber?: unknown;
  contact_number?: unknown;
  company?: unknown;
  leadSource?: unknown;
  lead_source?: unknown;
  roleInCompany?: unknown;
  role_in_company?: unknown;
  employeeCount?: unknown;
  employee_count?: unknown;
  expectations?: unknown;
  contactInfo?: unknown;
  externalId?: unknown;
  external_id?: unknown;
};

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

function resolveName(body: LeadGenBody) {
  return (
    compactString(body.name) ??
    compactString(body.fullName) ??
    compactString(body.full_name)
  );
}

function resolvePhone(body: LeadGenBody) {
  return (
    compactString(body.phone) ??
    compactString(body.contactNumber) ??
    compactString(body.contact_number)
  );
}

function resolveLeadSource(body: LeadGenBody) {
  return (
    compactString(body.lead_source) ??
    compactString(body.leadSource) ??
    DEFAULT_LEAD_SOURCE
  );
}

function resolveRoleInCompany(body: LeadGenBody) {
  return (
    compactString(body.roleInCompany) ?? compactString(body.role_in_company)
  );
}

function parseEmployeeCountOrNull(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed =
    typeof value === 'number' ? value : parseInt(String(value).trim(), 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function resolveEmployeeCount(body: LeadGenBody) {
  return (
    parseEmployeeCountOrNull(body.employeeCount) ??
    parseEmployeeCountOrNull(body.employee_count)
  );
}

function resolveExternalId(body: LeadGenBody) {
  return stringifyField(body.externalId) ?? stringifyField(body.external_id);
}

export async function GET() {
  return Response.json({ ok: true, route: 'leadgen-leads' });
}

export async function POST(request: Request) {
  const expectedSecret = process.env.CRM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: 'Webhook is not configured' },
      { status: 500 }
    );
  }

  const providedSecret = request.headers.get('x-webhook-secret');

  if (!isWebhookSecretValid(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: LeadGenBody;

  try {
    body = (await request.json()) as LeadGenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = resolveName(body);
  const company = compactString(body.company);
  const email = compactString(body.email);
  const phone = resolvePhone(body);

  // Company-first intake: a corporate lead may have no named person yet —
  // fall back to the company name as the row name (Hub Cards phone-only pattern).
  const effectiveName = name ?? company;

  if (!effectiveName && !email && !phone) {
    return NextResponse.json(
      { error: 'name, company, email or phone required' },
      { status: 400 }
    );
  }

  try {
    const result = await ingestExternalLead({
      source: LeadSourceType.OTHER,
      externalId: resolveExternalId(body),
      payload: body,
      defaultLeadSource: DEFAULT_LEAD_SOURCE,
      lead: {
        name: effectiveName,
        email,
        phone,
        company,
        leadSource: resolveLeadSource(body),
        roleInCompany: resolveRoleInCompany(body),
        employeeCount: resolveEmployeeCount(body),
        expectations: compactString(body.expectations),
        contactInfo: compactString(body.contactInfo),
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
  } catch (error) {
    console.error('[leadgen] Failed to ingest lead from webhook', error);

    return NextResponse.json(
      {
        error: 'Failed to save lead',
        detail: String(error instanceof Error ? error.message : error),
      },
      { status: 500 }
    );
  }
}
