import { timingSafeEqual } from 'crypto';
import { AssignmentRole, ClientStatus, DealParticipantRole, UserRole, UserStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cache } from 'react';
import {
  accessCheckPrisma,
  getAccessCheckLookupTransport,
} from '@/lib/accessCheckPrisma';
import {
  canAssignmentRoleChangePipelineStatus,
} from '@/lib/pipelinePermissions';
import {
  authUserPrisma,
  getAuthUserLookupTransport,
} from '@/lib/authUserPrisma';
import { verifyAuthToken } from '@/lib/jwt';
import { timeAsync } from '@/lib/performance';
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

/** Public shape for passing an already-resolved auth user into require* helpers. */
export type AuthenticatedUser = AuthUserRow;

/**
 * Phase 3B — auth User select (no joins/includes).
 *
 * Lookup key: primary key `User.id` (= JWT `id` / `sub`, or Supabase session `user.id`).
 * Not looked up by: email, org id, or external auth id (session id is the User PK).
 *
 * Fields:
 * - `id`, `role`, `status` — required for existence, ACTIVE gate, and ACL
 * - `name`, `email` — kept for shared callers (`/api/auth/token`, admin password verify)
 *
 * Client 360 read ACL only needs id+role(+status check); narrowing further would
 * force a second lookup on token/password routes for negligible column savings.
 */
export const authUserSelect = {
  id: true,
  role: true,
  name: true,
  email: true,
  status: true,
} as const;

/**
 * Phase 3A — Request-object memo for Bearer/session resolution.
 * Complements React `cache()` (token/session) so helper chains that call
 * getAuthenticatedUserFromRequest twice with the same Request pay once,
 * including outside RSC where React cache may not apply.
 * No cross-request caching (WeakMap entries die with the Request).
 */
const authResultByRequest = new WeakMap<Request, Promise<AuthResult>>();

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

/**
 * Single User PK lookup. Timed as `auth:userLookup` with transport meta.
 * Uses Phase 3B direct client when enabled (see `lib/authUserPrisma.ts`).
 */
async function loadAuthUserById(
  userId: string,
  path: 'bearer' | 'session'
): Promise<AuthUserRow | null> {
  return timeAsync(
    'auth:userLookup',
    () =>
      authUserPrisma.user.findUnique({
        where: { id: userId },
        select: authUserSelect,
      }),
    {
      getMeta: () => ({
        path,
        lookupKey: 'id',
        transport: getAuthUserLookupTransport(),
        select: 'id,role,name,email,status',
      }),
    }
  );
}

/** Request-scoped: session cookie → ACTIVE User row (deduped within one request). */
const getAuthenticatedUserFromSessionCached = cache(async (): Promise<AuthResult> => {
  const sessionResult = await timeAsync('auth:session:getSession', async () => {
    const supabase = await createSupabaseServerClient();
    return supabase.auth.getSession();
  });

  const {
    data: { session },
    error: sessionError,
  } = sessionResult;

  const user = session?.user;

  if (sessionError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Session subject is the CRM User.id (same PK as JWT payload.id).
  const dbUser = await loadAuthUserById(user.id, 'session');
  return toAuthResult(dbUser);
});

/**
 * Request-scoped Bearer resolution:
 * - JWT verify → payload.id (User PK)
 * - one User findUnique
 * - returns row | null (JWT ok, no row) | 'invalid' (JWT fail)
 * Does not call session; caller decides fallback only for 'invalid'.
 */
const resolveBearerUserCached = cache(
  async (token: string): Promise<AuthUserRow | null | 'invalid'> => {
    try {
      const payload = await timeAsync('auth:bearer:jwt', () =>
        verifyAuthToken(token)
      );
      return loadAuthUserById(payload.id, 'bearer');
    } catch {
      return 'invalid';
    }
  }
);

async function resolveAuthenticatedUserFromRequestUncached(
  request: Request
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();

    if (token) {
      const bearerUser = await resolveBearerUserCached(token);

      // Common JWT path: verified token + User row → ACTIVE check; no session work.
      if (bearerUser !== 'invalid' && bearerUser !== null) {
        return toAuthResult(bearerUser);
      }

      // Phase 3B: valid JWT but missing User → 404 without session fallback
      // (avoids getSession + second User lookup). Invalid/expired JWT still
      // falls through to session cookies for browser dual-auth.
      if (bearerUser === null) {
        return {
          error: NextResponse.json({ error: 'User not found' }, { status: 404 }),
        };
      }
      // bearerUser === 'invalid' → try session below.
    }
  }

  return getAuthenticatedUserFromSessionCached();
}

/**
 * Session-cookie auth. Prefer getAuthenticatedUserFromRequest when a Request
 * is available so Bearer tokens work the same as the browser cookie path.
 */
export async function getAuthenticatedUser() {
  return getAuthenticatedUserFromSessionCached();
}

/**
 * Bearer JWT or session cookie.
 *
 * Resolution (Phase 3A/3B):
 * 1. Bearer present → verify JWT → User.findUnique({ where: { id } }) via authUserPrisma
 * 2. Valid JWT + ACTIVE user → return (no session)
 * 3. Valid JWT + DEACTIVATED → 403 (no session fallback)
 * 4. Valid JWT + missing User → 404 (no session fallback; Phase 3B)
 * 5. Invalid/expired/missing Bearer → Supabase session → same User PK lookup
 *
 * Request-cached (WeakMap + React cache). No cross-request User cache.
 * PERF: `auth:bearer:jwt`, `auth:userLookup` (path/transport meta), `auth:session:getSession`.
 */
export async function getAuthenticatedUserFromRequest(request: Request) {
  const existing = authResultByRequest.get(request);
  if (existing) {
    return existing;
  }

  const promise = resolveAuthenticatedUserFromRequestUncached(request);
  authResultByRequest.set(request, promise);
  return promise;
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

/**
 * Phase 3A — request-scoped assignment lookup (React cache).
 * Phase 3C — existence query via accessCheckPrisma (DIRECT_URL when enabled).
 * Same (userId, clientId, roles) within one request shares one DB round-trip.
 */
const hasClientAssignmentCached = cache(
  async (userId: string, clientId: string, rolesKey: string) => {
    const roles =
      rolesKey.length > 0
        ? (rolesKey.split(',') as AssignmentRole[])
        : undefined;

    return timeAsync(
      'access:assignment',
      () =>
        accessCheckPrisma.clientAssignment.findFirst({
          where: {
            clientId,
            userId,
            ...(roles ? { role: { in: roles } } : {}),
          },
          select: { assignmentId: true, role: true },
        }),
      {
        getMeta: (result) => ({
          transport: getAccessCheckLookupTransport(),
          hit: Boolean(result),
          roles: rolesKey || 'any',
        }),
      }
    );
  }
);

export async function hasClientAssignment(
  userId: string,
  clientId: string,
  roles?: AssignmentRole[]
) {
  const rolesKey = roles?.length
    ? [...roles].map(String).sort().join(',')
    : '';
  return hasClientAssignmentCached(userId, clientId, rolesKey);
}

/**
 * Request-scoped deal-participant existence for this client.
 * Optional `roles` narrows to those DealParticipantRole values.
 */
const hasDealParticipantOnClientCached = cache(
  async (userId: string, clientId: string, rolesKey: string) => {
    const roles =
      rolesKey.length > 0
        ? (rolesKey.split(',') as DealParticipantRole[])
        : undefined;

    return timeAsync(
      'access:dealParticipant',
      () =>
        accessCheckPrisma.dealParticipant.findFirst({
          where: {
            userId,
            ...(roles ? { role: { in: roles } } : {}),
            deal: { clientId },
          },
          select: { id: true },
        }),
      {
        getMeta: (result) => ({
          transport: getAccessCheckLookupTransport(),
          hit: Boolean(result),
          roles: rolesKey || 'any',
        }),
      }
    );
  }
);

/** True when the user is a DealParticipant on at least one deal for this client. */
export async function hasDealParticipantOnClient(
  userId: string,
  clientId: string,
  roles?: DealParticipantRole[]
) {
  const rolesKey = roles?.length
    ? [...roles].map(String).sort().join(',')
    : '';
  return hasDealParticipantOnClientCached(userId, clientId, rolesKey);
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

/**
 * Lightweight deals list view gate (Phase 2G).
 * SUPER_ADMIN: no Deal table read.
 * Standard: assignment role exists OR any DOCTOR participant on this client (findFirst).
 * Note: {@link getDealAccessForClient} also skips admin deal-id enumeration (Phase 2K)
 * because `canManageAll` is sufficient for manage checks.
 */
export async function canViewClientDeals(
  userId: string,
  userRole: UserRole,
  clientId: string
): Promise<boolean> {
  if (userRole === UserRole.SUPER_ADMIN) {
    return true;
  }

  const assignment = await hasClientAssignment(
    userId,
    clientId,
    DEAL_VIEW_CLIENT_ROLES
  );
  if (assignment) {
    return true;
  }

  const doctorParticipant = await hasDealParticipantOnClient(userId, clientId, [
    DealParticipantRole.DOCTOR,
  ]);

  return Boolean(doctorParticipant);
}

export async function getDealAccessForClient(
  userId: string,
  userRole: UserRole,
  clientId: string
): Promise<DealAccessForClient> {
  if (userRole === UserRole.SUPER_ADMIN) {
    // canManageAll covers every deal id — skip findMany (Phase 2K; same permissions).
    return {
      canView: true,
      canCreate: true,
      canManageAll: true,
      manageableDealIds: [],
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

/**
 * Light participant-picker gate (Phase 2I.2).
 * Same truth table as {@link canUseDealParticipantPicker} + {@link getDealAccessForClient},
 * without SUPER_ADMIN enumerating all deal ids.
 */
export async function canAccessDealParticipantPicker(
  userId: string,
  userRole: UserRole,
  clientId: string
): Promise<boolean> {
  if (userRole === UserRole.SUPER_ADMIN) {
    return true;
  }

  // canCreate || canManageAll (DOCTOR is in DEAL_CREATE_CLIENT_ROLES)
  const assignment = await hasClientAssignment(
    userId,
    clientId,
    DEAL_CREATE_CLIENT_ROLES
  );
  if (assignment) {
    return true;
  }

  const doctorParticipant = await hasDealParticipantOnClient(userId, clientId, [
    DealParticipantRole.DOCTOR,
  ]);

  return Boolean(doctorParticipant);
}

async function requireAuthenticatedActiveUser(request?: Request) {
  return resolveAuthenticatedUser(request);
}

/**
 * Deal list/detail view gate. Phase 2I.2: uses {@link canViewClientDeals}
 * (no admin findMany of all deal ids). Manage/create still use getDealAccessForClient.
 */
export async function requireDealViewAccess(
  clientId: string,
  request?: Request
) {
  const auth = await requireAuthenticatedActiveUser(request);
  if (auth.error) {
    return auth;
  }

  const allowed = await canViewClientDeals(
    auth.user.id,
    auth.user.role,
    clientId
  );

  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
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
