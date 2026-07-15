import {
  AssignmentRole,
  ClientStatus,
  type UserRole,
  UserRole as UserRoleEnum,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  authorizeClientDetailsEdit,
  canReadClientCore,
  getAuthenticatedUserFromRequest,
  hasClientAssignment,
} from '@/lib/authHelpers';
import {
  classifyImportantDateRecordType,
} from '@/lib/importantDates';
import { prisma } from '@/lib/prisma';

/** Minimal user shape for Important Dates calendar / CRUD permission checks. */
export type ImportantDatePermissionUser = {
  id: string;
  role: UserRole;
};

/**
 * Important-date row shape used for single-record visibility checks.
 * `clientId` is the owner (leads share the Client model — leadId === clientId).
 */
export type ImportantDateVisibilityRecord = {
  clientId: string;
  id?: string;
};

export type ImportantDateRecordType = 'Lead' | 'Client';

/**
 * `null` = unrestricted (see everything).
 * `string[]` = only these owner Client ids (may be empty).
 */
export type AccessibleOwnerIds = string[] | null;

const CLIENT_STATUSES_FOR_CALENDAR: ClientStatus[] = [ClientStatus.ACTIVE_CLIENT];
const LEAD_STATUSES_FOR_CALENDAR: ClientStatus[] = [
  ClientStatus.NEW_LEAD,
  ClientStatus.CONTACTED,
  ClientStatus.NURTURING,
  ClientStatus.STRATEGY_SESSION,
  ClientStatus.ARCHIVED,
];

/**
 * SUPER_ADMIN can see important dates for every client and lead.
 * (This CRM has no separate ADMIN UserRole — only SUPER_ADMIN / STANDARD_USER.)
 */
export function canViewAllImportantDates(
  user: ImportantDatePermissionUser
): boolean {
  return user.role === UserRoleEnum.SUPER_ADMIN;
}

/**
 * Owner Client ids the user may see on the Important Dates calendar.
 * Aligns with Client 360 core read: SUPER_ADMIN → all; otherwise any
 * ClientAssignment (incl. DOCTOR / RELATIONSHIP / ACCOUNT_SERVICE) or
 * DealParticipant on the client. No separate manager/branch rules exist.
 *
 * @returns `null` when unrestricted; otherwise the accessible id list.
 */
export async function getAccessibleOwnerIdsForImportantDates(
  user: ImportantDatePermissionUser
): Promise<AccessibleOwnerIds> {
  if (canViewAllImportantDates(user)) {
    return null;
  }

  const [assignmentRows, participantRows] = await Promise.all([
    prisma.clientAssignment.findMany({
      where: { userId: user.id },
      select: { clientId: true },
    }),
    prisma.dealParticipant.findMany({
      where: { userId: user.id },
      select: { deal: { select: { clientId: true } } },
    }),
  ]);

  const ids = new Set<string>();
  for (const row of assignmentRows) {
    ids.add(row.clientId);
  }
  for (const row of participantRows) {
    ids.add(row.deal.clientId);
  }

  return [...ids];
}

/**
 * Accessible owner ids whose status is treated as Client (ACTIVE_CLIENT).
 * `null` = unrestricted (caller must not filter by id).
 */
export async function getAccessibleClientIdsForImportantDates(
  user: ImportantDatePermissionUser
): Promise<AccessibleOwnerIds> {
  const ownerIds = await getAccessibleOwnerIdsForImportantDates(user);
  if (ownerIds === null) {
    return null;
  }
  if (ownerIds.length === 0) {
    return [];
  }

  const rows = await prisma.client.findMany({
    where: {
      id: { in: ownerIds },
      status: { in: CLIENT_STATUSES_FOR_CALENDAR },
    },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

/**
 * Accessible owner ids whose status is treated as Lead (non–ACTIVE_CLIENT).
 * `null` = unrestricted.
 */
export async function getAccessibleLeadIdsForImportantDates(
  user: ImportantDatePermissionUser
): Promise<AccessibleOwnerIds> {
  const ownerIds = await getAccessibleOwnerIdsForImportantDates(user);
  if (ownerIds === null) {
    return null;
  }
  if (ownerIds.length === 0) {
    return [];
  }

  const rows = await prisma.client.findMany({
    where: {
      id: { in: ownerIds },
      status: { in: LEAD_STATUSES_FOR_CALENDAR },
    },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

/**
 * Whether the user may see one important-date row (by owning client/lead id).
 * Same rules as Client 360 core read / calendar access.
 */
export async function canViewImportantDate(
  user: ImportantDatePermissionUser,
  importantDate: ImportantDateVisibilityRecord
): Promise<boolean> {
  if (!importantDate.clientId) {
    return false;
  }

  return canReadClientCore(user.id, user.role, importantDate.clientId);
}

/**
 * Whether the user may create/update/delete important dates for a client or lead.
 * Same gate as Client Details edit: SUPER_ADMIN or RELATIONSHIP assignee.
 *
 * @param recordType Lead | Client (informational — same Client row underneath)
 * @param recordId Owner Client id (= leadId when recordType is Lead)
 */
export async function canManageImportantDate(
  user: ImportantDatePermissionUser,
  recordType: ImportantDateRecordType,
  recordId: string
): Promise<boolean> {
  void recordType; // same storage; kept for call-site clarity / future divergence

  if (!recordId) {
    return false;
  }

  if (user.role === UserRoleEnum.SUPER_ADMIN) {
    return true;
  }

  if (user.role !== UserRoleEnum.STANDARD_USER) {
    return false;
  }

  const assignment = await hasClientAssignment(user.id, recordId, [
    AssignmentRole.RELATIONSHIP,
  ]);

  return Boolean(assignment);
}

/**
 * Prisma `where` fragment for calendar list queries.
 * Returns a filter that excludes every row when the user has no access.
 * Returns `{}` (no owner filter) when the user can view all.
 */
export async function buildImportantDatesCalendarVisibilityWhere(
  user: ImportantDatePermissionUser
): Promise<{ clientId?: { in: string[] } }> {
  const ownerIds = await getAccessibleOwnerIdsForImportantDates(user);

  if (ownerIds === null) {
    return {};
  }

  if (ownerIds.length === 0) {
    // Match nothing — do not omit the filter (that would return all rows).
    return { clientId: { in: [] } };
  }

  return { clientId: { in: ownerIds } };
}

/**
 * Auth gate for Important Dates calendar GET APIs.
 * Ensures the caller is authenticated; data filtering is applied via
 * `buildImportantDatesCalendarVisibilityWhere` / accessible-id helpers.
 */
export async function requireImportantDatesCalendarAccess(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth;
  }

  return {
    user: auth.user as ImportantDatePermissionUser & {
      name?: string | null;
      email?: string;
    },
  };
}

/**
 * Auth gate for manage APIs that already know the owner id.
 * Prefer existing `authorizeClientDetailsEdit` for request handlers;
 * this helper is for non-Request call sites / calendar action menus.
 */
export async function requireImportantDateManageAccess(
  request: Request,
  recordType: ImportantDateRecordType,
  recordId: string
) {
  const auth = await authorizeClientDetailsEdit(request, recordId);
  if (auth.error) {
    return auth;
  }

  const allowed = await canManageImportantDate(auth.user, recordType, recordId);
  if (!allowed) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

/** Resolve Lead vs Client label from an owner Client status (calendar / UI). */
export function resolveImportantDateRecordType(
  status: ClientStatus | string
): ImportantDateRecordType {
  return classifyImportantDateRecordType(status);
}

/**
 * Convenience: can this user view important dates for ownerId?
 * Prefer batch helpers + visibility where for calendar list endpoints.
 */
export async function canViewImportantDatesForOwner(
  user: ImportantDatePermissionUser,
  ownerId: string
): Promise<boolean> {
  return canReadClientCore(user.id, user.role, ownerId);
}
