import {
  AssignmentRole,
  DealParticipantRole,
  UserRole,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  canReadClientCore,
  getAuthenticatedUserFromRequest,
  getClientOr404,
  hasClientAssignment,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

/** Minimal user shape used by Client Strategy Builder permission checks. */
export type ClientStrategyPermissionUser = {
  id: string;
  role: UserRole;
};

/**
 * View: SUPER_ADMIN, any ClientAssignment, or any DealParticipant on the client
 * (same pattern as Client 360 core read).
 */
export async function canViewClientStrategy(
  user: ClientStrategyPermissionUser,
  clientId: string
): Promise<boolean> {
  return canReadClientCore(user.id, user.role, clientId);
}

/**
 * Manage (create/edit): SUPER_ADMIN, legacy client-level DOCTOR assignment,
 * or deal-level DOCTOR participant on any deal for this client.
 */
export async function canManageClientStrategy(
  user: ClientStrategyPermissionUser,
  clientId: string
): Promise<boolean> {
  if (user.role === UserRole.SUPER_ADMIN) {
    return true;
  }

  const doctorAssignment = await hasClientAssignment(user.id, clientId, [
    AssignmentRole.DOCTOR,
  ]);
  if (doctorAssignment) {
    return true;
  }

  const doctorParticipant = await prisma.dealParticipant.findFirst({
    where: {
      userId: user.id,
      role: DealParticipantRole.DOCTOR,
      deal: { clientId },
    },
    select: { id: true },
  });

  return Boolean(doctorParticipant);
}

/**
 * Delete: same as manage for v1.
 */
export async function canDeleteClientStrategy(
  user: ClientStrategyPermissionUser,
  clientId: string
): Promise<boolean> {
  return canManageClientStrategy(user, clientId);
}

export async function requireStrategyViewAccess(
  clientId: string,
  request: Request
) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck;
  }

  const allowed = await canViewClientStrategy(auth.user, clientId);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

export async function requireStrategyManageAccess(
  clientId: string,
  request: Request
) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck;
  }

  const allowed = await canManageClientStrategy(auth.user, clientId);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

export async function requireStrategyDeleteAccess(
  clientId: string,
  request: Request
) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck;
  }

  const allowed = await canDeleteClientStrategy(auth.user, clientId);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}
