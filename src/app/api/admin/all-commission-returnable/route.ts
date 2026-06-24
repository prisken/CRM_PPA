import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import {
  formatCommissionReturnable,
  parseCommissionReturnablePeriodFilter,
  parseCommissionReturnableStatusFilter,
} from '@/lib/commissionReturnables';
import { timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
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

  const payload = await timeRouteHandler(
    'GET /api/admin/all-commission-returnable',
    async () => {
      const returnables = await prisma.commissionReturnable.findMany({
        where: {
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(periodFilter ? { period: periodFilter } : {}),
        },
        select: {
          id: true,
          amount: true,
          status: true,
          period: true,
          userId: true,
          dealId: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          deal: {
            select: {
              id: true,
              name: true,
              clientId: true,
              dealValue: true,
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

      return {
        returnables: returnables.map((record) =>
          formatCommissionReturnable(record, {
            user: record.user,
            deal: record.deal,
          })
        ),
      };
    },
    (result) => ({
      returnableCount: result.returnables.length,
      hasStatusFilter: Boolean(statusFilter),
      hasPeriodFilter: Boolean(periodFilter),
    })
  );

  return NextResponse.json(payload);
}
