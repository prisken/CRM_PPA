import {
  AssignmentRole,
  ClientStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DEFAULT_LEAD_SOURCE = 'Google Form';

const CLIENT_SELECT = {
  id: true,
  name: true,
  company: true,
  contactInfo: true,
  email: true,
  phone: true,
  leadSource: true,
  roleInCompany: true,
  employeeCount: true,
  expectations: true,
  status: true,
  createdAt: true,
} as const;

type GoogleFormsLeadBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  company?: unknown;
  leadSource?: unknown;
  roleInCompany?: unknown;
  employeeCount?: unknown;
  expectations?: unknown;
  contactInfo?: unknown;
};

function trimOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function formatClientResponse(
  client: {
    id: string;
    name: string;
    company: string | null;
    contactInfo: string | null;
    email: string | null;
    phone: string | null;
    leadSource: string | null;
    roleInCompany: string | null;
    employeeCount: number | null;
    expectations: string | null;
    status: ClientStatus;
    createdAt: Date;
  },
  assignmentId?: string
) {
  return {
    client_id: client.id,
    name: client.name,
    company: client.company,
    contactInfo: client.contactInfo,
    email: client.email,
    phone: client.phone,
    lead_source: client.leadSource,
    role_in_company: client.roleInCompany,
    employee_count: client.employeeCount,
    expectations: client.expectations,
    status: client.status,
    createdAt: client.createdAt,
    ...(assignmentId ? { assignment_id: assignmentId } : {}),
  };
}

async function resolveDefaultRelationshipUserId() {
  const configuredUserId = process.env.GOOGLE_FORMS_DEFAULT_RELATIONSHIP_USER_ID?.trim();

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

  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const clientData = {
    name,
    company: trimOrNull(body.company),
    contactInfo: trimOrNull(body.contactInfo),
    email: trimOrNull(body.email),
    phone: trimOrNull(body.phone),
    leadSource: trimOrNull(body.leadSource) ?? DEFAULT_LEAD_SOURCE,
    roleInCompany: trimOrNull(body.roleInCompany),
    employeeCount: parseEmployeeCountOrNull(body.employeeCount),
    expectations: trimOrNull(body.expectations),
    status: ClientStatus.NEW_LEAD,
  };

  try {
    const defaultRelationshipUserId = await resolveDefaultRelationshipUserId();

    if (defaultRelationshipUserId) {
      const result = await prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: clientData,
          select: CLIENT_SELECT,
        });

        const assignment = await tx.clientAssignment.create({
          data: {
            clientId: client.id,
            userId: defaultRelationshipUserId,
            role: AssignmentRole.RELATIONSHIP,
          },
          select: { assignmentId: true },
        });

        return { client, assignmentId: assignment.assignmentId };
      });

      return NextResponse.json(
        formatClientResponse(result.client, result.assignmentId),
        { status: 201 }
      );
    }

    const client = await prisma.client.create({
      data: clientData,
      select: CLIENT_SELECT,
    });

    return NextResponse.json(formatClientResponse(client), { status: 201 });
  } catch (error) {
    console.error('[google-forms] Failed to create lead from webhook');

    return NextResponse.json(
      { error: 'Failed to create lead' },
      { status: 500 }
    );
  }
}
