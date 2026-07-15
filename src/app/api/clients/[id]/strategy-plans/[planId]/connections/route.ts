import { StrategyConnectionType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { requireStrategyManageAccess } from '@/lib/clientStrategyPermissions';
import {
  assertStepsBelongToPlan,
  formatStrategyConnection,
  getStrategyPlanForClient,
  strategyConnectionDetailSelect,
} from '@/lib/clientStrategyPlans';
import { createStrategyConnectionSchema } from '@/lib/clientStrategyValidation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const { id: clientId, planId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = createStrategyConnectionSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const stepError = await assertStepsBelongToPlan(planId, [
    parsed.data.fromStepId,
    parsed.data.toStepId,
  ]);
  if (stepError) {
    return stepError;
  }

  const connection = await prisma.clientStrategyConnection.create({
    data: {
      strategyPlanId: planId,
      fromStepId: parsed.data.fromStepId,
      toStepId: parsed.data.toStepId,
      connectionType:
        parsed.data.connectionType ?? StrategyConnectionType.MANUAL,
      purpose: parsed.data.purpose ?? null,
      expectedOutcome: parsed.data.expectedOutcome ?? null,
      timing: parsed.data.timing ?? null,
    },
    select: strategyConnectionDetailSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_connection',
    action: 'created',
    label: planCheck.plan.title,
  });

  return NextResponse.json(
    { connection: formatStrategyConnection(connection) },
    { status: 201 }
  );
}
