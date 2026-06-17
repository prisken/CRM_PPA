import { AssignmentRole, ClientStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

function parseEmployeeCount(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed =
    typeof value === 'number' ? value : parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: 'employee_count must be a non-negative integer' as const };
  }

  return parsed;
}

function trimOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  if (
    auth.user.role !== UserRole.SUPER_ADMIN &&
    auth.user.role !== UserRole.STANDARD_USER
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  const name = typeof body.name === 'string' ? body.name : '';
  const company = trimOrNull(body.company);
  const contactInfo = trimOrNull(body.contactInfo);
  const email = trimOrNull(body.email);
  const phone = trimOrNull(body.phone);
  const leadSource = trimOrNull(body.lead_source ?? body.leadSource);
  const roleInCompany = trimOrNull(body.role_in_company ?? body.roleInCompany);
  const expectations = trimOrNull(body.expectations);
  const status = body.status ?? ClientStatus.NEW_LEAD;

  if (!name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  if (!Object.values(ClientStatus).includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const employeeCountResult = parseEmployeeCount(
    body.employee_count ?? body.employeeCount
  );

  if (
    employeeCountResult !== null &&
    typeof employeeCountResult === 'object' &&
    'error' in employeeCountResult
  ) {
    return NextResponse.json({ error: employeeCountResult.error }, { status: 400 });
  }

  const clientData = {
    name: name.trim(),
    company,
    contactInfo,
    email,
    phone,
    leadSource,
    roleInCompany,
    employeeCount: employeeCountResult,
    expectations,
    status,
  };

  if (auth.user.role === UserRole.STANDARD_USER) {
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({ data: clientData });

      const assignment = await tx.clientAssignment.create({
        data: {
          clientId: client.id,
          userId: auth.user.id,
          role: AssignmentRole.RELATIONSHIP,
        },
      });

      return { client, assignment };
    });

    return NextResponse.json(
      {
        client_id: result.client.id,
        name: result.client.name,
        company: result.client.company,
        contactInfo: result.client.contactInfo,
        email: result.client.email,
        phone: result.client.phone,
        lead_source: result.client.leadSource,
        role_in_company: result.client.roleInCompany,
        employee_count: result.client.employeeCount,
        expectations: result.client.expectations,
        status: result.client.status,
        createdAt: result.client.createdAt,
        assignment_id: result.assignment.assignmentId,
      },
      { status: 201 }
    );
  }

  const client = await prisma.client.create({
    data: clientData,
  });

  return NextResponse.json(
    {
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
    },
    { status: 201 }
  );
}
