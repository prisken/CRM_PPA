import { NextResponse } from 'next/server';
import {
  getClientOr404,
  logClientSystemEvent,
  requireSuperAdmin,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const body = await request.json();
  const { name, email, phone, lead_source, company, contactInfo } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
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
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      leadSource: true,
      company: true,
      contactInfo: true,
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
    lastModified: client.lastModified.toISOString(),
  });
}
