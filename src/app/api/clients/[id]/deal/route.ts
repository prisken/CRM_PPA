import { AssignmentRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  getClientOr404,
  logClientSystemEvent,
  requireSuperAdminOrClientRole,
} from '@/lib/authHelpers';
import { upsertPrimaryDeal } from '@/lib/clientDeals';
import { prisma } from '@/lib/prisma';

function parseMoneyValue(value: unknown, fieldName: string) {
  if (value === undefined) {
    return { error: `${fieldName} is required` };
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || numericValue < 0) {
    return { error: `${fieldName} must be a non-negative number` };
  }

  return { value: numericValue };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientRole(clientId, [
    AssignmentRole.RELATIONSHIP,
  ]);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const body = await request.json();
  const dealValueResult = parseMoneyValue(body.deal_value, 'deal_value');
  if ('error' in dealValueResult) {
    return NextResponse.json({ error: dealValueResult.error }, { status: 400 });
  }

  const grossProfitResult = parseMoneyValue(body.gross_profit, 'gross_profit');
  if ('error' in grossProfitResult) {
    return NextResponse.json({ error: grossProfitResult.error }, { status: 400 });
  }

  const { value: dealValue } = dealValueResult;
  const { value: grossProfit } = grossProfitResult;

  await prisma.client.update({
    where: { id: clientId },
    data: { dealValue },
  });

  const deal = await upsertPrimaryDeal(clientId, dealValue, grossProfit);

  await logClientSystemEvent(
    clientId,
    `Deal updated: value ${dealValue}, gross profit ${grossProfit}`,
    auth.user.id
  );

  return NextResponse.json({
    client_id: clientId,
    deal_value: dealValue,
    gross_profit: grossProfit,
    deal_id: deal.id,
  });
}
