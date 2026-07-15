import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { requireStrategyManageAccess } from '@/lib/clientStrategyPermissions';
import {
  assertStepsBelongToPlan,
  formatStrategyConnection,
  getStrategyPlanForClient,
  strategyConnectionDetailSelect,
} from '@/lib/clientStrategyPlans';
import { updateStrategyConnectionSchema } from '@/lib/clientStrategyValidation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getConnectionForPlan(
  strategyPlanId: string,
  connectionId: string
) {
  const connection = await prisma.clientStrategyConnection.findFirst({
    where: { id: connectionId, strategyPlanId },
    select: {
      id: true,
      fromStepId: true,
      toStepId: true,
    },
  });

  if (!connection) {
    return {
      error: NextResponse.json(
        { error: 'Strategy connection not found' },
        { status: 404 }
      ),
    };
  }

  return { connection };
}

export async function PUT(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; planId: string; connectionId: string }>;
  }
) {
  const { id: clientId, planId, connectionId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const connectionCheck = await getConnectionForPlan(planId, connectionId);
  if (connectionCheck.error) {
    return connectionCheck.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateStrategyConnectionSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const nextFromStepId =
    parsed.data.fromStepId ?? connectionCheck.connection.fromStepId;
  const nextToStepId =
    parsed.data.toStepId ?? connectionCheck.connection.toStepId;

  if (nextFromStepId === nextToStepId) {
    return NextResponse.json(
      { error: 'fromStepId cannot equal toStepId' },
      { status: 400 }
    );
  }

  if (
    parsed.data.fromStepId !== undefined ||
    parsed.data.toStepId !== undefined
  ) {
    const stepError = await assertStepsBelongToPlan(planId, [
      nextFromStepId,
      nextToStepId,
    ]);
    if (stepError) {
      return stepError;
    }
  }

  const connection = await prisma.clientStrategyConnection.update({
    where: { id: connectionId },
    data: {
      ...(parsed.data.fromStepId !== undefined && {
        fromStepId: parsed.data.fromStepId,
      }),
      ...(parsed.data.toStepId !== undefined && {
        toStepId: parsed.data.toStepId,
      }),
      ...(parsed.data.connectionType !== undefined && {
        connectionType: parsed.data.connectionType,
      }),
      ...(parsed.data.purpose !== undefined && {
        purpose: parsed.data.purpose,
      }),
      ...(parsed.data.expectedOutcome !== undefined && {
        expectedOutcome: parsed.data.expectedOutcome,
      }),
      ...(parsed.data.timing !== undefined && { timing: parsed.data.timing }),
    },
    select: strategyConnectionDetailSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_connection',
    action: 'updated',
    label: planCheck.plan.title,
  });

  return NextResponse.json({
    connection: formatStrategyConnection(connection),
  });
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string; planId: string; connectionId: string }>;
  }
) {
  return PUT(request, context);
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; planId: string; connectionId: string }>;
  }
) {
  const { id: clientId, planId, connectionId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const connectionCheck = await getConnectionForPlan(planId, connectionId);
  if (connectionCheck.error) {
    return connectionCheck.error;
  }

  await prisma.clientStrategyConnection.delete({
    where: { id: connectionId },
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_connection',
    action: 'deleted',
    label: planCheck.plan.title,
  });

  return NextResponse.json({ connectionId, deleted: true });
}
