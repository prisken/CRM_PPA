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

async function getDealForClient(clientId: string, dealId: string) {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, clientId },
    select: { id: true, name: true, status: true },
  });

  if (!deal) {
    return { error: NextResponse.json({ error: 'Deal not found' }, { status: 404 }) };
  }

  return { deal };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; dealId: string }> }
) {
  const { id: clientId, dealId } = await params;
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

  const dealCheck = await getDealForClient(clientId, dealId);
  if (dealCheck.error) {
    return dealCheck.error;
  }

  const previousStatus = dealCheck.deal.status;

  const body = await request.json();
  const name = body.name !== undefined ? body.name?.trim() : undefined;

  if (name !== undefined && !name) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
  }

  const dealValueResult =
    body.dealValue !== undefined || body.deal_value !== undefined
      ? parseMoneyValue(body.dealValue ?? body.deal_value, 'dealValue')
      : undefined;

  if (dealValueResult && 'error' in dealValueResult) {
    return NextResponse.json({ error: dealValueResult.error }, { status: 400 });
  }

  const totalCommissionResult =
    body.totalCommission !== undefined ||
    body.total_commission !== undefined ||
    body.grossProfit !== undefined ||
    body.gross_profit !== undefined
      ? parseMoneyValue(
          body.totalCommission ??
            body.total_commission ??
            body.grossProfit ??
            body.gross_profit,
          'totalCommission'
        )
      : undefined;

  if (totalCommissionResult && 'error' in totalCommissionResult) {
    return NextResponse.json({ error: totalCommissionResult.error }, { status: 400 });
  }

  const status = body.status;
  if (status !== undefined && !Object.values(DealStatus).includes(status)) {
    return NextResponse.json({ error: 'Invalid deal status' }, { status: 400 });
  }

  const updatedDeal = await prisma.deal.update({
    where: { id: dealId },
    data: {
      ...(name !== undefined && { name }),
      ...(dealValueResult && 'value' in dealValueResult && {
        dealValue: dealValueResult.value,
      }),
      ...(totalCommissionResult && 'value' in totalCommissionResult && {
        totalCommission: totalCommissionResult.value,
      }),
      ...(status !== undefined && { status }),
    },
  });

  if (
    updatedDeal.status === DealStatus.WON &&
    previousStatus !== DealStatus.WON
  ) {
    await createCommissionReturnablesForWonDeal({
      dealId: updatedDeal.id,
      clientId,
      totalCommission: Number(updatedDeal.totalCommission),
    });
  }

  await logClientSystemEvent(
    clientId,
    `Deal updated: ${updatedDeal.name}`,
    auth.user.id
  );

  return NextResponse.json(formatDealResponse(updatedDeal));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; dealId: string }> }
) {
  const { id: clientId, dealId } = await params;
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

  const dealCheck = await getDealForClient(clientId, dealId);
  if (dealCheck.error) {
    return dealCheck.error;
  }

  const deal = await prisma.deal.delete({
    where: { id: dealId },
    select: { id: true, name: true },
  });

  await logClientSystemEvent(
    clientId,
    `Deal deleted: ${deal.name}`,
    auth.user.id
  );

  return NextResponse.json({ dealId: deal.id, deleted: true });
}
