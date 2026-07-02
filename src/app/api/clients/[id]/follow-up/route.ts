import { NextResponse } from 'next/server';
import {
  authorizeClientDetailsEdit,
  getClientOr404,
  logClientSystemEvent,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);

function parsePriority(
  value: unknown
): string | null | undefined | { error: string } {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'string' && VALID_PRIORITIES.has(value)) {
    return value;
  }

  return { error: 'priority must be LOW, MEDIUM, HIGH, or null' };
}

function parseNextAction(
  value: unknown
): string | null | undefined | { error: string } {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return { error: 'nextAction must be a string or null' };
}

function parseNextFollowUpAt(
  value: unknown
): Date | null | undefined | { error: string } {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return { error: 'nextFollowUpAt must be an ISO date string or null' };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: 'nextFollowUpAt must be a valid date' };
  }

  return parsed;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const auth = await authorizeClientDetailsEdit(request, clientId);
    if (auth.error) {
      return auth.error;
    }

    const clientCheck = await getClientOr404(clientId);
    if (clientCheck.error) {
      return clientCheck.error;
    }

    const body = await request.json();
    const parsedPriority = parsePriority(body.priority);
    if (typeof parsedPriority === 'object' && parsedPriority !== null && 'error' in parsedPriority) {
      return NextResponse.json({ error: parsedPriority.error }, { status: 400 });
    }

    const parsedNextAction = parseNextAction(body.nextAction);
    if (typeof parsedNextAction === 'object' && parsedNextAction !== null && 'error' in parsedNextAction) {
      return NextResponse.json({ error: parsedNextAction.error }, { status: 400 });
    }

    const parsedNextFollowUpAt = parseNextFollowUpAt(body.nextFollowUpAt);
    if (
      typeof parsedNextFollowUpAt === 'object' &&
      parsedNextFollowUpAt !== null &&
      'error' in parsedNextFollowUpAt
    ) {
      return NextResponse.json({ error: parsedNextFollowUpAt.error }, { status: 400 });
    }

    if (
      parsedPriority === undefined &&
      parsedNextAction === undefined &&
      parsedNextFollowUpAt === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one follow-up field is required' },
        { status: 400 }
      );
    }

    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(parsedPriority !== undefined && { priority: parsedPriority }),
        ...(parsedNextAction !== undefined && { nextAction: parsedNextAction }),
        ...(parsedNextFollowUpAt !== undefined && {
          nextFollowUpAt: parsedNextFollowUpAt,
        }),
      },
      select: {
        priority: true,
        nextAction: true,
        nextFollowUpAt: true,
      },
    });

    await logClientSystemEvent(
      clientId,
      'Follow-up details updated.',
      auth.user.id
    );

    return NextResponse.json({
      priority: client.priority,
      nextAction: client.nextAction,
      nextFollowUpAt: client.nextFollowUpAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Failed to update client follow-up:', error);
    return NextResponse.json(
      { error: 'Failed to update client follow-up' },
      { status: 500 }
    );
  }
}
