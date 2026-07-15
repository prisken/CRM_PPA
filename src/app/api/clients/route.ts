import { AssignmentRole, ClientStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import {
  parseClientContactInput,
  replaceClientContacts,
} from '@/lib/clientContacts';
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

  const contactsParsed = parseClientContactInput(body);
  if (!contactsParsed.ok) {
    return NextResponse.json({ error: contactsParsed.error }, { status: 400 });
  }

  const email = contactsParsed.data.emailsProvided
    ? contactsParsed.data.email
    : trimOrNull(body.email);
  const phone = contactsParsed.data.phonesProvided
    ? contactsParsed.data.phone
    : trimOrNull(body.phone);

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

  const emailsForSync = contactsParsed.data.emailsProvided
    ? contactsParsed.data.emails
    : email
      ? [email]
      : [];
  const phonesForSync = contactsParsed.data.phonesProvided
    ? contactsParsed.data.phones
    : phone
      ? [phone]
      : [];

  if (auth.user.role === UserRole.STANDARD_USER) {
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({ data: clientData });

      await replaceClientContacts(tx, client.id, {
        emails: emailsForSync,
        phones: phonesForSync,
      });

      const assignment = await tx.clientAssignment.create({
        data: {
          clientId: client.id,
          userId: auth.user.id,
          role: AssignmentRole.RELATIONSHIP,
        },
      });

      const refreshed = await tx.client.findUniqueOrThrow({
        where: { id: client.id },
        select: {
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
        },
      });

      return { client: refreshed, assignment };
    });

    return NextResponse.json(
      {
        client_id: result.client.id,
        name: result.client.name,
        company: result.client.company,
        contactInfo: result.client.contactInfo,
        email: result.client.email,
        phone: result.client.phone,
        emails: emailsForSync,
        phones: phonesForSync,
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

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: clientData,
    });
    await replaceClientContacts(tx, created.id, {
      emails: emailsForSync,
      phones: phonesForSync,
    });
    return tx.client.findUniqueOrThrow({
      where: { id: created.id },
      select: {
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
      },
    });
  });

  return NextResponse.json(
    {
      client_id: client.id,
      name: client.name,
      company: client.company,
      contactInfo: client.contactInfo,
      email: client.email,
      phone: client.phone,
      emails: emailsForSync,
      phones: phonesForSync,
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
