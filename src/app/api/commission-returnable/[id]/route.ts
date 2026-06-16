import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { formatCommissionReturnable } from '@/lib/commissionReturnables';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const { id } = await params;

  const existing = await prisma.commissionReturnable.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Commission returnable not found' },
      { status: 404 }
    );
  }

  if (existing.userId !== auth.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (existing.status === 'PAID') {
    return NextResponse.json(
      { error: 'Commission returnable is already marked as paid' },
      { status: 409 }
    );
  }

  const updated = await prisma.commissionReturnable.update({
    where: { id },
    data: { status: 'PAID' },
    include: {
      deal: {
        select: {
          id: true,
          name: true,
          clientId: true,
          dealValue: true,
          totalCommission: true,
          client: {
            select: {
              id: true,
              name: true,
              company: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    returnable: formatCommissionReturnable(updated, { deal: updated.deal }),
  });
}
