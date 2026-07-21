/**
 * Phase 2J — narrow Client 360 read-only request context.
 *
 * Owns: auth + one light view gate + optional privileged miss-path existence check.
 * Does NOT own: domain queries, manage/edit flags, deal-id enumeration, RSC flags.
 *
 * Call sites still run their own resource query after a successful context resolve.
 *
 * Layer boundaries (Phase 2M — do not blur):
 * - This helper is for **read-only GET** route setup only.
 * - Do **not** use it (or widen it) as mutation/manage authority.
 * - Do **not** treat RSC `resolveClient360PageAccess` flags as a substitute for this
 *   (or for `require*` / `getDealAccessForClient` on write paths).
 * - Keep the capability set narrow; prefer route-local domain queries.
 */
import { UserRole, UserStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAccessCheckLookupTransport } from '@/lib/accessCheckPrisma';
import {
  canReadClientCore,
  canViewClientDeals,
  getAuthenticatedUserFromRequest,
  getClientOr404,
  hasClientAssignment,
} from '@/lib/authHelpers';
import { canViewClientStrategy } from '@/lib/clientStrategyPermissions';
import { timeAsync } from '@/lib/performance';

/** Intentionally narrow — do not grow into a mega ACL bag. */
export type Client360ViewCapability =
  | 'core:read'
  | 'strategy:view'
  | 'deals:view'
  | 'sourceRecords:view'
  /** Same gate as sourceRecords:view (SUPER_ADMIN or any ClientAssignment). */
  | 'workspace:view';

export type Client360ContextUser = {
  id: string;
  role: UserRole;
  name: string | null;
  email: string;
  status: UserStatus;
};

export type Client360RequestContext = {
  user: Client360ContextUser;
  userId: string;
  role: UserRole;
  isSuperAdmin: boolean;
  clientId: string;
  canView: true;
  /**
   * After an empty/miss domain query: SUPER_ADMIN only — prove client exists
   * (404 Client not found) vs domain empty/miss. Non-admin: no-op (returns null).
   * Timed as `${perfPrefix}:clientLookup`.
   */
  ensureClientExistsForPrivilegedMiss: () => Promise<NextResponse | null>;
};

export type ResolveClient360ContextResult =
  | { ok: true; ctx: Client360RequestContext }
  | { ok: false; error: NextResponse };

async function checkViewCapability(
  capability: Client360ViewCapability,
  user: Client360ContextUser,
  clientId: string
): Promise<boolean> {
  switch (capability) {
    case 'core:read':
      return canReadClientCore(user.id, user.role, clientId);
    case 'strategy:view':
      return canViewClientStrategy(user, clientId);
    case 'deals:view':
      return canViewClientDeals(user.id, user.role, clientId);
    case 'sourceRecords:view':
    case 'workspace:view': {
      if (user.role === UserRole.SUPER_ADMIN) {
        return true;
      }
      return Boolean(await hasClientAssignment(user.id, clientId));
    }
    default: {
      const _exhaustive: never = capability;
      return _exhaustive;
    }
  }
}

/**
 * Auth → light view gate (403-first, no pre-access getClientOr404).
 * Domain query and response mapping stay in the route.
 */
export async function resolveClient360Context(options: {
  clientId: string;
  request: Request;
  capability: Client360ViewCapability;
  /** e.g. `client360:sourceRecords` — labels `${perfPrefix}:auth|access|clientLookup` */
  perfPrefix: string;
}): Promise<ResolveClient360ContextResult> {
  const { clientId, request, capability, perfPrefix } = options;

  const auth = await timeAsync(`${perfPrefix}:auth`, () =>
    getAuthenticatedUserFromRequest(request)
  );
  if (auth.error) {
    return { ok: false, error: auth.error };
  }

  const user = auth.user;
  const allowed = await timeAsync(
    `${perfPrefix}:access`,
    () => checkViewCapability(capability, user, clientId),
    {
      getMeta: (result) => ({
        capability,
        role: user.role,
        allowed: result,
        transport: getAccessCheckLookupTransport(),
      }),
    }
  );
  if (!allowed) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  const ctx: Client360RequestContext = {
    user,
    userId: user.id,
    role: user.role,
    isSuperAdmin,
    clientId,
    canView: true,
    ensureClientExistsForPrivilegedMiss: async () => {
      if (!isSuperAdmin) {
        return null;
      }
      const clientCheck = await timeAsync(`${perfPrefix}:clientLookup`, () =>
        getClientOr404(clientId)
      );
      return clientCheck.error ?? null;
    },
  };

  return { ok: true, ctx };
}
