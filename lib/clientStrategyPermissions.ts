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
  type AuthenticatedUser,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

/** Minimal user shape used by Client Strategy Builder permission checks. */
export type ClientStrategyPermissionUser = {
  id: string;
  role: UserRole;
};

type StrategyAccessSuccess = { user: AuthenticatedUser; error?: undefined };
type StrategyAccessFailure = { error: NextResponse; user?: undefined };
type StrategyAccessResult = StrategyAccessSuccess | StrategyAccessFailure;

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

/**
 * Strategy plan view gate.
 * Phase 2I.3: 403-first — do not call getClientOr404 before access (hide existence).
 * Callers that need a missing-client 404 for authorized/admin users must check
 * existence after access (e.g. empty list or missing plan).
 *
 * Phase 3A: pass `user` when auth was already resolved in this request to skip
 * a second getAuthenticatedUserFromRequest (WeakMap/React cache also cover this).
 */
export async function requireStrategyViewAccess(
  clientId: string,
  request: Request,
  options?: { user?: AuthenticatedUser }
): Promise<StrategyAccessResult> {
  let user: AuthenticatedUser;
  if (options?.user) {
    user = options.user;
  } else {
    const auth = await getAuthenticatedUserFromRequest(request);
    if (auth.error) {
      return auth;
    }
    user = auth.user;
  }

  const allowed = await canViewClientStrategy(user, clientId);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
}

export async function requireStrategyManageAccess(
  clientId: string,
  request: Request,
  options?: { user?: AuthenticatedUser }
): Promise<StrategyAccessResult> {
  let user: AuthenticatedUser;
  if (options?.user) {
    user = options.user;
  } else {
    const auth = await getAuthenticatedUserFromRequest(request);
    if (auth.error) {
      return auth;
    }
    user = auth.user;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck;
  }

  const allowed = await canManageClientStrategy(user, clientId);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
}

export async function requireStrategyDeleteAccess(
  clientId: string,
  request: Request,
  options?: { user?: AuthenticatedUser }
): Promise<StrategyAccessResult> {
  let user: AuthenticatedUser;
  if (options?.user) {
    user = options.user;
  } else {
    const auth = await getAuthenticatedUserFromRequest(request);
    if (auth.error) {
      return auth;
    }
    user = auth.user;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck;
  }

  const allowed = await canDeleteClientStrategy(user, clientId);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
}
