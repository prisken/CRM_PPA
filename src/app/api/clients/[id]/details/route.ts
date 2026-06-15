import { NextResponse } from 'next/server';
import {
  authorizeClientDetailsEdit,
  getClientOr404,
  logClientSystemEvent,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const auth = await authorizeClientDetailsEdit(request, clientId);
    if (auth.error) {
      return auth.error;
    }

    const clientCheck = await getClientOr404(clientId);
    if (clientCheck.error) {
      return clientCheck.error;
    }

    const body = await request.json();
  const {
    name,
    email,
    phone,
    lead_source,
    company,
    contactInfo,
    roleInCompany,
    employeeCount,
    expectations,
    importantDates,
  } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
  }

  if (employeeCount !== undefined && employeeCount !== null) {
    const parsedCount = Number(employeeCount);
    if (!Number.isInteger(parsedCount) || parsedCount < 0) {
      return NextResponse.json(
        { error: 'employeeCount must be a non-negative integer' },
        { status: 400 }
      );
    }
  }

  if (importantDates !== undefined && importantDates !== null && !Array.isArray(importantDates)) {
    return NextResponse.json(
      { error: 'importantDates must be an array' },
      { status: 400 }
    );
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(email !== undefined && { email: email?.trim() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(lead_source !== undefined && { leadSource: lead_source?.trim() || null }),
      ...(company !== undefined && { company: company?.trim() || null }),
      ...(contactInfo !== undefined && { contactInfo: contactInfo?.trim() || null }),
      ...(roleInCompany !== undefined && {
        roleInCompany: roleInCompany?.trim() || null,
      }),
      ...(employeeCount !== undefined && {
        employeeCount:
          employeeCount === null ? null : Number(employeeCount),
      }),
      ...(expectations !== undefined && {
        expectations: expectations?.trim() || null,
      }),
      ...(importantDates !== undefined && {
        importantDates: importantDates ?? [],
      }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      leadSource: true,
      company: true,
      contactInfo: true,
      roleInCompany: true,
      employeeCount: true,
      expectations: true,
      importantDates: true,
      lastModified: true,
    },
  });

  await logClientSystemEvent(
    clientId,
    'Client details updated',
    auth.user.id
  );

  return NextResponse.json({
    client_id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    lead_source: client.leadSource,
    company: client.company,
    contactInfo: client.contactInfo,
    roleInCompany: client.roleInCompany,
    employeeCount: client.employeeCount,
    expectations: client.expectations,
    importantDates: client.importantDates,
    lastModified: client.lastModified.toISOString(),
  });
  } catch (error) {
    console.error('Failed to update client details:', error);
    return NextResponse.json(
      { error: 'Failed to update client details' },
      { status: 500 }
    );
  }
}
