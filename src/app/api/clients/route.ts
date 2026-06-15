import { AssignmentRole, ClientStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

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
  const { name, company, contactInfo, email, phone, status } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const clientStatus = status ?? ClientStatus.NEW_LEAD;
  if (!Object.values(ClientStatus).includes(clientStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const clientData = {
    name: name.trim(),
    company: company?.trim() || null,
    contactInfo: contactInfo?.trim() || null,
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    status: clientStatus,
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
      status: client.status,
      createdAt: client.createdAt,
    },
    { status: 201 }
  );
}
