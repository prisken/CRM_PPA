import { ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/authHelpers';

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const { name, company, contactInfo, status } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const clientStatus = status ?? ClientStatus.NEW_LEAD;
  if (!Object.values(ClientStatus).includes(clientStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: {
      name: name.trim(),
      company: company?.trim() || null,
      contactInfo: contactInfo?.trim() || null,
      status: clientStatus,
    },
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
