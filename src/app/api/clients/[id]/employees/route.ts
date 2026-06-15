import { AssignmentRole, ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getAuthenticatedUserFromRequest,
  logClientSystemEvent,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const auth = await getAuthenticatedUserFromRequest(request);
    if (auth.error) {
      return auth.error;
    }

    const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      company: true,
      employeeCount: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const colleagues =
    client.company?.trim()
      ? await prisma.client.findMany({
          where: {
            company: client.company,
            id: { not: clientId },
          },
          select: {
            id: true,
            name: true,
            roleInCompany: true,
            status: true,
          },
          orderBy: { name: 'asc' },
        })
      : [];

  return NextResponse.json({
    client_id: client.id,
    company: client.company,
    employeeCount: client.employeeCount,
    colleagues: colleagues.map((colleague) => ({
      client_id: colleague.id,
      name: colleague.name,
      roleInCompany: colleague.roleInCompany,
      status: colleague.status,
    })),
  });
  } catch (error) {
    console.error('Failed to load company hierarchy:', error);
    return NextResponse.json(
      { error: 'Failed to load company hierarchy' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: employerClientId } = await params;
    const auth = await getAuthenticatedUserFromRequest(request);
    if (auth.error) {
      return auth.error;
    }

    const body = await request.json();
  const fullName = body.fullName?.trim();
  const roleInCompany = body.roleInCompany?.trim();

  if (!fullName) {
    return NextResponse.json({ error: 'fullName is required' }, { status: 400 });
  }

  if (!roleInCompany) {
    return NextResponse.json(
      { error: 'roleInCompany is required' },
      { status: 400 }
    );
  }

  const employer = await prisma.client.findUnique({
    where: { id: employerClientId },
    select: { id: true, name: true, company: true },
  });

  if (!employer) {
    return NextResponse.json({ error: 'Employer client not found' }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const lead = await tx.client.create({
      data: {
        name: fullName,
        roleInCompany,
        company: employer.company,
        status: ClientStatus.NEW_LEAD,
      },
    });

    const assignment = await tx.clientAssignment.create({
      data: {
        clientId: lead.id,
        userId: auth.user.id,
        role: AssignmentRole.RELATIONSHIP,
      },
    });

    return { lead, assignment };
  });

  await logClientSystemEvent(
    result.lead.id,
    `Employee lead created from ${employer.name}`,
    auth.user.id
  );

  return NextResponse.json(
    {
      client_id: result.lead.id,
      name: result.lead.name,
      company: result.lead.company,
      roleInCompany: result.lead.roleInCompany,
      status: result.lead.status,
      employer_client_id: employer.id,
      assignment_id: result.assignment.assignmentId,
      createdAt: result.lead.createdAt.toISOString(),
    },
    { status: 201 }
  );
  } catch (error) {
    console.error('Failed to create employee lead:', error);
    return NextResponse.json(
      { error: 'Failed to create employee lead' },
      { status: 500 }
    );
  }
}
