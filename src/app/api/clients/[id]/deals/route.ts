import { AssignmentRole, DealStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getClientOr404,
  logClientSystemEvent,
  requireSuperAdminOrClientRole,
} from '@/lib/authHelpers';
import {
  createCommissionReturnablesForWonDeal,
} from '@/lib/commissionReturnables';
import {
  formatDealResponse,
  parseMoneyValue,
} from '@/lib/dealCalculations';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientRole(clientId, [
    AssignmentRole.DOCTOR,
  ]);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const deals = await prisma.deal.findMany({
    where: { clientId },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    client_id: clientId,
    deals: deals.map(formatDealResponse),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientRole(clientId, [
    AssignmentRole.DOCTOR,
  ]);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const body = await request.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const dealValueResult = parseMoneyValue(
    body.dealValue ?? body.deal_value,
    'dealValue'
  );
  if ('error' in dealValueResult) {
    return NextResponse.json({ error: dealValueResult.error }, { status: 400 });
  }

  const totalCommissionResult = parseMoneyValue(
    body.totalCommission ?? body.total_commission ?? body.grossProfit ?? body.gross_profit,
    'totalCommission'
  );
  if ('error' in totalCommissionResult) {
    return NextResponse.json({ error: totalCommissionResult.error }, { status: 400 });
  }

  const status = body.status ?? DealStatus.PROPOSED;
  if (!Object.values(DealStatus).includes(status)) {
    return NextResponse.json({ error: 'Invalid deal status' }, { status: 400 });
  }

  const deal = await prisma.deal.create({
    data: {
      clientId,
      name,
      dealValue: dealValueResult.value,
      totalCommission: totalCommissionResult.value,
      status,
    },
  });

  if (deal.status === DealStatus.WON) {
    await createCommissionReturnablesForWonDeal({
      dealId: deal.id,
      clientId,
      totalCommission: Number(deal.totalCommission),
    });
  }

  await logClientSystemEvent(
    clientId,
    `Deal created: ${deal.name} (${status})`,
    auth.user.id
  );

  return NextResponse.json(formatDealResponse(deal), { status: 201 });
}
