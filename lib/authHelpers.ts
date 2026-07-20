import { timingSafeEqual } from 'crypto';
import { AssignmentRole, ClientStatus, DealParticipantRole, UserRole, UserStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cache } from 'react';
import {
  canAssignmentRoleChangePipelineStatus,
} from '@/lib/pipelinePermissions';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

type AuthUserRow = {
  id: string;
  role: UserRole;
  name: string | null;
  email: string;
  status: UserStatus;
};

type AuthSuccess = { user: AuthUserRow; error?: undefined };
type AuthFailure = { error: NextResponse; user?: undefined };
type AuthResult = AuthSuccess | AuthFailure;

const authUserSelect = {
  id: true,
  role: true,
  name: true,
  email: true,
  status: true,
} as const;

function deactivatedError(): AuthFailure {
  return {
    error: NextResponse.json({ error: 'Account deactivated' }, { status: 403 }),
  };
}

function toAuthResult(dbUser: AuthUserRow | null): AuthResult {
  if (!dbUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  if (dbUser.status !== UserStatus.ACTIVE) {
    return deactivatedError();
  }

  return { user: dbUser };
}

/** Request-scoped: session cookie → ACTIVE User row (deduped within one request). */
const getAuthenticatedUserFromSessionCached = cache(async (): Promise<AuthResult> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const user = session?.user;

  if (sessionError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: authUserSelect,
  });

  return toAuthResult(dbUser);
});

/** Request-scoped: valid Bearer JWT → User row, or null if missing, or 'invalid' if JWT fails. */
const resolveBearerUserCached = cache(
  async (token: string): Promise<AuthUserRow | null | 'invalid'> => {
    try {
      const { verifyAuthToken } = await import('@/lib/jwt');
      const payload = await verifyAuthToken(token);

      return prisma.user.findUnique({
        where: { id: payload.id },
        select: authUserSelect,
      });
    } catch {
      return 'invalid';
    }
  }
);

/**
 * Session-cookie auth. Prefer getAuthenticatedUserFromRequest when a Request
 * is available so Bearer tokens work the same as the browser cookie path.
 */
export async function getAuthenticatedUser() {
  return getAuthenticatedUserFromSessionCached();
}

/**
 * Bearer JWT or session cookie. Invalid/expired Bearer falls back to session.
 * Valid Bearer for a DEACTIVATED user returns 403 (does not fall back).
 * User lookup is request-cached (session path and per-token Bearer path).
 */
export async function getAuthenticatedUserFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();

    if (token) {
      const bearerUser = await resolveBearerUserCached(token);
      if (bearerUser !== 'invalid' && bearerUser !== null) {
        return toAuthResult(bearerUser);
      }
      // Missing User row or invalid/expired token → try session cookie.
    }
  }

  return getAuthenticatedUserFromSessionCached();
}

export async function requireSuperAdminFromRequest(request?: Request) {
  const auth = request
    ? await getAuthenticatedUserFromRequest(request)
    : await getAuthenticatedUser();

  if (auth.error) {
    return auth;
  }

  if (auth.user.role !== UserRole.SUPER_ADMIN) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

function secretsEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * True when the request presents a valid `CRON_SECRET` via
 * `Authorization: Bearer <secret>` or `x-cron-secret: <secret>`.
 * Returns false when `CRON_SECRET` is unset/empty (cron path disabled).
 */
export function requestMatchesCronSecret(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && secretsEqual(match[1].trim(), cronSecret)) {
      return true;
    }
  }

  const headerSecret = request.headers.get('x-cron-secret')?.trim();
  if (headerSecret && secretsEqual(headerSecret, cronSecret)) {
    return true;
  }

  return false;
}

/**
 * Background job processor gate: `CRON_SECRET` (staging/prod cron) **or**
 * super admin session/Bearer. Always requires one of the two — never open.
 */
export async function requireCronSecretOrSuperAdmin(
  request: Request
): Promise<AuthResult | { ok: true; via: 'cron' | 'super_admin' }> {
  if (requestMatchesCronSecret(request)) {
    return { ok: true, via: 'cron' };
  }

  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth;
  }

  return { ok: true, via: 'super_admin' };
}

/**
 * Super-admin gate. Pass `request` when available so Bearer or session both work.
 * Without `request`, session cookie only (legacy call sites).
 */
export async function requireSuperAdmin(request?: Request) {
  return requireSuperAdminFromRequest(request);
}

export async function authorizeClientDetailsEdit(request: Request, clientId: string) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth;
  }

  if (auth.user.role === UserRole.SUPER_ADMIN) {
    return auth;
  }

  if (auth.user.role === UserRole.STANDARD_USER) {
    const assignment = await hasClientAssignment(
      auth.user.id,
      clientId,
      [AssignmentRole.RELATIONSHIP]
    );

    if (assignment) {
      return { ...auth, assignment };
    }
  }

  return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

export async function requireStandardUser(request?: Request) {
  const auth = request
    ? await getAuthenticatedUserFromRequest(request)
    : await getAuthenticatedUser();

  if (auth.error) {
    return auth;
  }

  if (auth.user.role !== UserRole.STANDARD_USER) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

export async function getClientOr404(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });

  if (!client) {
    return { error: NextResponse.json({ error: 'Client not found' }, { status: 404 }) };
  }

  return { client };
}

export async function hasClientAssignment(
  userId: string,
  clientId: string,
  roles?: AssignmentRole[]
) {
  const assignment = await prisma.clientAssignment.findFirst({
    where: {
      clientId,
      userId,
      ...(roles ? { role: { in: roles } } : {}),
    },
    select: { assignmentId: true, role: true },
  });

  return assignment;
}

/** True when the user is a DealParticipant (any role) on at least one deal for this client. */
export async function hasDealParticipantOnClient(
  userId: string,
  clientId: string
) {
  const participant = await prisma.dealParticipant.findFirst({
    where: {
      userId,
      deal: { clientId },
    },
    select: { id: true },
  });

  return participant;
}

export async function canReadClientCore(
  userId: string,
  userRole: UserRole,
  clientId: string
) {
  if (userRole === UserRole.SUPER_ADMIN) {
    return true;
  }

  const assignment = await hasClientAssignment(userId, clientId);
  if (assignment) {
    return true;
  }

  const participant = await hasDealParticipantOnClient(userId, clientId);
  return Boolean(participant);
}

export async function canAccessClientHierarchy(
  userId: string,
  userRole: UserRole,
  clientId: string
) {
  if (userRole === UserRole.SUPER_ADMIN) {
    return true;
  }

  const assignment = await hasClientAssignment(userId, clientId);
  return Boolean(assignment);
}

async function resolveAuthenticatedUser(request?: Request) {
  return request
    ? getAuthenticatedUserFromRequest(request)
    : getAuthenticatedUser();
}

/**
 * Client 360 core read: SUPER_ADMIN, any ClientAssignment, or any DealParticipant on the client.
 */
export async function requireClientCoreReadAccess(
  clientId: string,
  request?: Request
) {
  const auth = await resolveAuthenticatedUser(request);
  if (auth.error) {
    return auth;
  }

  const allowed = await canReadClientCore(
    auth.user.id,
    auth.user.role,
    clientId
  );

  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

/**
 * Company hierarchy view: SUPER_ADMIN or any ClientAssignment (not deal-only participants).
 */
export async function requireClientHierarchyAccess(
  clientId: string,
  request?: Request
) {
  const auth = await resolveAuthenticatedUser(request);
  if (auth.error) {
    return auth;
  }

  const allowed = await canAccessClientHierarchy(
    auth.user.id,
    auth.user.role,
    clientId
  );

  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

/**
 * Create employee lead: SUPER_ADMIN or any ClientAssignment (not deal-only participants).
 */
export async function requireClientEmployeeLeadCreateAccess(
  clientId: string,
  request?: Request
) {
  return requireClientHierarchyAccess(clientId, request);
}

export async function requireSuperAdminOrClientRole(
  clientId: string,
  roles: AssignmentRole[],
  request?: Request
) {
  const auth = await resolveAuthenticatedUser(request);
  if (auth.error) {
    return auth;
  }

  if (auth.user.role === UserRole.SUPER_ADMIN) {
    return auth;
  }

  const assignment = await hasClientAssignment(auth.user.id, clientId, roles);
  if (!assignment) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ...auth, assignment };
}

const DEAL_VIEW_CLIENT_ROLES: AssignmentRole[] = [
  AssignmentRole.RELATIONSHIP,
  AssignmentRole.ACCOUNT_SERVICE,
  AssignmentRole.DOCTOR,
];

const DEAL_CREATE_CLIENT_ROLES: AssignmentRole[] = [
  AssignmentRole.RELATIONSHIP,
  AssignmentRole.ACCOUNT_SERVICE,
  AssignmentRole.DOCTOR,
];

export type DealAccessForClient = {
  canView: boolean;
  canCreate: boolean;
  canManageAll: boolean;
  manageableDealIds: string[];
};

export async function getDealAccessForClient(
  userId: string,
  userRole: UserRole,
  clientId: string
): Promise<DealAccessForClient> {
  if (userRole === UserRole.SUPER_ADMIN) {
    const deals = await prisma.deal.findMany({
      where: { clientId },
      select: { id: true },
    });

    return {
      canView: true,
      canCreate: true,
      canManageAll: true,
      manageableDealIds: deals.map((deal) => deal.id),
    };
  }

  const assignments = await prisma.clientAssignment.findMany({
    where: { clientId, userId },
    select: { role: true },
  });
  const assignmentRoles = new Set(assignments.map((assignment) => assignment.role));

  const doctorParticipantRows = await prisma.dealParticipant.findMany({
    where: {
      userId,
      role: DealParticipantRole.DOCTOR,
      deal: { clientId },
    },
    select: { dealId: true },
  });

  const manageableDealIds = doctorParticipantRows.map((row) => row.dealId);
  const canView =
    DEAL_VIEW_CLIENT_ROLES.some((role) => assignmentRoles.has(role)) ||
    manageableDealIds.length > 0;
  const canCreate = DEAL_CREATE_CLIENT_ROLES.some((role) => assignmentRoles.has(role));
  const canManageAll = assignmentRoles.has(AssignmentRole.DOCTOR);

  return {
    canView,
    canCreate,
    canManageAll,
    manageableDealIds,
  };
}

export function canUseDealParticipantPicker(
  userRole: UserRole,
  access: DealAccessForClient
) {
  return (
    userRole === UserRole.SUPER_ADMIN ||
    access.canCreate ||
    access.canManageAll ||
    access.manageableDealIds.length > 0
  );
}

async function requireAuthenticatedActiveUser(request?: Request) {
  return resolveAuthenticatedUser(request);
}

export async function requireDealViewAccess(
  clientId: string,
  request?: Request
) {
  const auth = await requireAuthenticatedActiveUser(request);
  if (auth.error) {
    return auth;
  }

  const access = await getDealAccessForClient(
    auth.user.id,
    auth.user.role,
    clientId
  );

  if (!access.canView) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ...auth, dealAccess: access };
}

export async function requireDealCreateAccess(
  clientId: string,
  request?: Request
) {
  const auth = await requireAuthenticatedActiveUser(request);
  if (auth.error) {
    return auth;
  }

  const access = await getDealAccessForClient(
    auth.user.id,
    auth.user.role,
    clientId
  );

  if (!access.canCreate) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ...auth, dealAccess: access };
}

export async function requireDealManageAccess(
  clientId: string,
  dealId: string,
  request?: Request
) {
  const auth = await requireAuthenticatedActiveUser(request);
  if (auth.error) {
    return auth;
  }

  const access = await getDealAccessForClient(
    auth.user.id,
    auth.user.role,
    clientId
  );

  if (access.canManageAll || access.manageableDealIds.includes(dealId)) {
    return { ...auth, dealAccess: access };
  }

  return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

export async function hasDealParticipantRole(
  userId: string,
  dealId: string,
  role: DealParticipantRole
) {
  const participant = await prisma.dealParticipant.findFirst({
    where: {
      dealId,
      userId,
      role,
    },
    select: { id: true },
  });

  return participant;
}

export async function requireSuperAdminOrClientAccess(
  clientId: string,
  request?: Request
) {
  const auth = await resolveAuthenticatedUser(request);
  if (auth.error) {
    return auth;
  }

  if (auth.user.role === UserRole.SUPER_ADMIN) {
    return auth;
  }

  const assignment = await hasClientAssignment(auth.user.id, clientId);
  if (!assignment) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ...auth, assignment };
}

export async function logClientSystemEvent(
  clientId: string,
  content: string,
  userId?: string
) {
  await prisma.clientActivityLog.create({
    data: {
      clientId,
      type: 'SYSTEM',
      content,
      userId: userId ?? null,
    },
  });
}

export async function verifyAdminPassword(email: string, password: string) {
  if (!password?.trim()) {
    return { valid: false as const, error: 'Password is required' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { valid: false as const, error: 'Auth is not configured' };
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { valid: false as const, error: 'Incorrect password' };
  }

  return { valid: true as const };
}

export { canAssignmentRoleChangePipelineStatus } from '@/lib/pipelinePermissions';

export function authorizeInteractionOwner(
  userId: string,
  userRole: UserRole,
  interactionUserId: string
) {
  if (userRole === UserRole.SUPER_ADMIN || userId === interactionUserId) {
    return { authorized: true as const };
  }

  return {
    authorized: false as const,
    error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  };
}

export async function authorizePipelineStatusChange(
  userId: string,
  userRole: UserRole,
  clientId: string,
  currentStatus: ClientStatus
) {
  if (userRole === UserRole.SUPER_ADMIN) {
    return { authorized: true as const };
  }

  if (userRole !== UserRole.STANDARD_USER) {
    return {
      authorized: false as const,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const assignments = await prisma.clientAssignment.findMany({
    where: { clientId, userId },
    select: { role: true },
  });

  if (assignments.length === 0) {
    return {
      authorized: false as const,
      error: NextResponse.json(
        { error: 'You are not assigned to this client' },
        { status: 403 }
      ),
    };
  }

  const canChange = assignments.some((assignment) =>
    canAssignmentRoleChangePipelineStatus(assignment.role, currentStatus)
  );

  if (!canChange) {
    return {
      authorized: false as const,
      error: NextResponse.json(
        {
          error:
            'Your assignment role does not allow changing the pipeline stage from the current status',
        },
        { status: 403 }
      ),
    };
  }

  return { authorized: true as const };
}
