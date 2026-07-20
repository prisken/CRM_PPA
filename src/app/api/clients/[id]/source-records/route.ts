import { NextResponse } from 'next/server';
import {
  getClientOr404,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const records = await prisma.clientSourceRecord.findMany({
    where: { clientId },
    select: {
      id: true,
      source: true,
      externalId: true,
      normalizedEmail: true,
      normalizedPhone: true,
      receivedAt: true,
      createdAt: true,
      payload: true,
    },
    orderBy: { receivedAt: 'desc' },
  });

  return NextResponse.json({
    sourceRecords: records.map((record) => ({
      id: record.id,
      source: record.source,
      externalId: record.externalId,
      normalizedEmail: record.normalizedEmail,
      normalizedPhone: record.normalizedPhone,
      receivedAt: record.receivedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      payload: record.payload,
    })),
  });
}
