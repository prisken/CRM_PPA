import {
  AssignmentRole,
  LeadSourceType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { ingestExternalLead } from '@/lib/leadIngestion';
import { compactString } from '@/lib/leadNormalization';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DEFAULT_LEAD_SOURCE = 'Google Form';

type GoogleFormsLeadBody = {
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
  submissionId?: unknown;
  responseId?: unknown;
  rowId?: unknown;
  timestamp?: unknown;
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

function resolveName(body: GoogleFormsLeadBody) {
  return (
    compactString(body.name) ??
    compactString(body.fullName) ??
    compactString(body.full_name)
  );
}

function resolvePhone(body: GoogleFormsLeadBody) {
  return (
    compactString(body.phone) ??
    compactString(body.contactNumber) ??
    compactString(body.contact_number)
  );
}

function resolveLeadSource(body: GoogleFormsLeadBody) {
  return (
    compactString(body.lead_source) ??
    compactString(body.leadSource) ??
    DEFAULT_LEAD_SOURCE
  );
}

function resolveRoleInCompany(body: GoogleFormsLeadBody) {
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

function resolveEmployeeCount(body: GoogleFormsLeadBody) {
  return (
    parseEmployeeCountOrNull(body.employeeCount) ??
    parseEmployeeCountOrNull(body.employee_count)
  );
}

function resolveExternalId(body: GoogleFormsLeadBody) {
  return (
    stringifyField(body.submissionId) ??
    stringifyField(body.responseId) ??
    stringifyField(body.rowId) ??
    stringifyField(body.timestamp)
  );
}

async function resolveDefaultRelationshipUserId() {
  const configuredUserId =
    process.env.GOOGLE_FORMS_DEFAULT_RELATIONSHIP_USER_ID?.trim();

  if (!configuredUserId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: configuredUserId },
    select: { id: true, role: true, status: true },
  });

  if (
    !user ||
    user.status !== UserStatus.ACTIVE ||
    (user.role !== UserRole.STANDARD_USER && user.role !== UserRole.SUPER_ADMIN)
  ) {
    console.warn(
      '[google-forms] GOOGLE_FORMS_DEFAULT_RELATIONSHIP_USER_ID is invalid or user is not assignable; lead created without assignment'
    );
    return null;
  }

  return user.id;
}

async function assignDefaultRelationship(clientId: string, userId: string) {
  await prisma.clientAssignment.create({
    data: {
      clientId,
      userId,
      role: AssignmentRole.RELATIONSHIP,
    },
  });
}

export async function POST(request: Request) {
  const expectedSecret = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;

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

  let body: GoogleFormsLeadBody;

  try {
    body = (await request.json()) as GoogleFormsLeadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = resolveName(body);

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const result = await ingestExternalLead({
      source: LeadSourceType.GOOGLE_FORMS,
      externalId: resolveExternalId(body),
      payload: body,
      defaultLeadSource: DEFAULT_LEAD_SOURCE,
      lead: {
        name,
        email: compactString(body.email),
        phone: resolvePhone(body),
        company: compactString(body.company),
        leadSource: resolveLeadSource(body),
        roleInCompany: resolveRoleInCompany(body),
        employeeCount: resolveEmployeeCount(body),
        expectations: compactString(body.expectations),
        contactInfo: compactString(body.contactInfo),
      },
    });

    if (result.action === 'created') {
      const defaultRelationshipUserId = await resolveDefaultRelationshipUserId();

      if (defaultRelationshipUserId) {
        await assignDefaultRelationship(
          result.clientId,
          defaultRelationshipUserId
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        action: result.action,
        clientId: result.clientId,
        matchedBy: result.matchedBy,
      },
      { status: result.action === 'created' ? 201 : 200 }
    );
  } catch {
    console.error('[google-forms] Failed to create lead from webhook');

    return NextResponse.json(
      { error: 'Failed to create lead' },
      { status: 500 }
    );
  }
}
