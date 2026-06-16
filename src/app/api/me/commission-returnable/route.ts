import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import {
  formatCommissionReturnable,
  parseCommissionReturnablePeriodFilter,
  parseCommissionReturnableStatusFilter,
} from '@/lib/commissionReturnables';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = parseCommissionReturnableStatusFilter(
    searchParams.get('status')
  );
  if (statusFilter === null) {
    return NextResponse.json(
      { error: 'status must be UNPAID or PAID' },
      { status: 400 }
    );
  }

  const periodFilter = parseCommissionReturnablePeriodFilter(
    searchParams.get('period')
  );
  if (periodFilter === null) {
    return NextResponse.json(
      { error: 'period must be a valid date or YYYY-MM value' },
      { status: 400 }
    );
  }

  const returnables = await prisma.commissionReturnable.findMany({
    where: {
      userId: auth.user.id,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(periodFilter ? { period: periodFilter } : {}),
    },
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
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({
    returnables: returnables.map((record) =>
      formatCommissionReturnable(record, { deal: record.deal })
    ),
  });
}
