/**
 * Phase 2K — Client 360 RSC page access resolve-once.
 *
 * Computes view/manage flags for the page shell in one place so Client360Page
 * does not re-run canReadClientCore + canAccessClientHierarchy +
 * canViewClientStrategy + canManageClientStrategy + getDealAccessForClient
 * as separate round trips.
 *
 * Does NOT authorize mutations — API routes remain authoritative.
 * Does NOT load client/deals/hierarchy payloads.
 *
 * Layer boundaries (Phase 2M — do not blur):
 * - Output flags are **UI rendering convenience** (show/hide widgets, enable buttons).
 * - Never pass these flags into API handlers as proof of access.
 * - Mutations must still call route-level `require*` / `getDealAccessForClient`
 *   (or equivalent) on the write path.
 * - Do not merge this with `resolveClient360Context` into a universal ACL bag.
 */
import { AssignmentRole, DealParticipantRole, UserRole } from '@prisma/client';
import type { DealAccessForClient } from '@/lib/authHelpers';
import { timeAsync } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

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

export type Client360PageAccessUser = {
  id: string;
  role: UserRole;
};

export type Client360PageAccess = {
  canViewHierarchy: boolean;
  dealAccess: DealAccessForClient;
  strategyAccess: {
    canView: boolean;
    canManage: boolean;
  };
};

function superAdminPageAccess(): Client360PageAccess {
  // canManageAll covers every deal — no need to enumerate deal ids (Phase 2K).
  return {
    canViewHierarchy: true,
    dealAccess: {
      canView: true,
      canCreate: true,
      canManageAll: true,
      manageableDealIds: [],
    },
    strategyAccess: {
      canView: true,
      canManage: true,
    },
  };
}

/**
 * Resolve page-level Client 360 access flags once.
 * Returns `null` when the user cannot read the client (caller redirects;
 * does not disclose existence).
 */
export async function resolveClient360PageAccess(
  user: Client360PageAccessUser,
  clientId: string
): Promise<Client360PageAccess | null> {
  return timeAsync(
    'client360:rscPageAccess',
    async () => {
      if (user.role === UserRole.SUPER_ADMIN) {
        return superAdminPageAccess();
      }

      const [assignments, doctorParticipantRows] = await timeAsync(
        'client360:rscPageAccess:queries',
        () =>
          Promise.all([
            prisma.clientAssignment.findMany({
              where: { clientId, userId: user.id },
              select: { role: true },
            }),
            prisma.dealParticipant.findMany({
              where: {
                userId: user.id,
                role: DealParticipantRole.DOCTOR,
                deal: { clientId },
              },
              select: { dealId: true },
            }),
          ])
      );

      const assignmentRoles = new Set(
        assignments.map((assignment) => assignment.role)
      );
      const hasAssignment = assignmentRoles.size > 0;
      const manageableDealIds = doctorParticipantRows.map((row) => row.dealId);

      let canRead =
        hasAssignment || manageableDealIds.length > 0;

      if (!canRead) {
        // Core read allows any deal participant role (not only DOCTOR).
        const anyParticipant = await timeAsync(
          'client360:rscPageAccess:anyParticipant',
          () =>
            prisma.dealParticipant.findFirst({
              where: {
                userId: user.id,
                deal: { clientId },
              },
              select: { id: true },
            })
        );
        canRead = Boolean(anyParticipant);
      }

      if (!canRead) {
        return null;
      }

      const canManageAll = assignmentRoles.has(AssignmentRole.DOCTOR);
      const canViewDeals =
        DEAL_VIEW_CLIENT_ROLES.some((role) => assignmentRoles.has(role)) ||
        manageableDealIds.length > 0;
      const canCreate = DEAL_CREATE_CLIENT_ROLES.some((role) =>
        assignmentRoles.has(role)
      );
      const canManageStrategy =
        canManageAll || manageableDealIds.length > 0;

      return {
        canViewHierarchy: hasAssignment,
        dealAccess: {
          canView: canViewDeals,
          canCreate,
          canManageAll,
          manageableDealIds,
        },
        strategyAccess: {
          // Same allow-list as canViewClientStrategy / canReadClientCore.
          canView: true,
          canManage: canManageStrategy,
        },
      };
    },
    {
      getMeta: (result) => ({
        clientId,
        allowed: result !== null,
        canViewDeals: result?.dealAccess.canView ?? false,
        canViewHierarchy: result?.canViewHierarchy ?? false,
        canManageStrategy: result?.strategyAccess.canManage ?? false,
        isSuperAdmin: user.role === UserRole.SUPER_ADMIN,
      }),
    }
  );
}
