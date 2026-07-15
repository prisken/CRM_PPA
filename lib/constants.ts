import { AssignmentRole } from '@prisma/client';

// Defines the total commission percentage allocated to each role's "pool".
export const COMMISSION_RATE_POOLS: Record<AssignmentRole, number> = {
  DOCTOR: 0.6,
  RELATIONSHIP: 0.1,
  ACCOUNT_SERVICE: 0.1,
};

// Defines the company's share of the total commission.
export const COMPANY_OVERHEAD_RATE = 0.2;

// Defines the maximum number of users allowed per role on a single client team.
// DOCTOR: legacy client-level rows only — new doctors are assigned per deal (API rejects new DOCTOR assignments).
export const ROLE_OCCUPANCY_LIMITS: Record<AssignmentRole, number> = {
  DOCTOR: 2,
  RELATIONSHIP: 1,
  ACCOUNT_SERVICE: 1,
};

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  DOCTOR: 'Legacy Doctor Assignment',
  RELATIONSHIP: 'Relationship Officer',
  ACCOUNT_SERVICE: 'Follow-up Officer',
};

export const ASSIGNMENT_ROLE_LABELS_PLURAL: Record<AssignmentRole, string> = {
  DOCTOR: 'Legacy Doctor Assignments',
  RELATIONSHIP: 'Relationship Officers',
  ACCOUNT_SERVICE: 'Follow-up Officers',
};

/** Client-level team roles shown on the standard dashboard (not deal-level doctors). */
export const CLIENT_TEAM_ASSIGNMENT_ROLES: AssignmentRole[] = [
  AssignmentRole.RELATIONSHIP,
  AssignmentRole.ACCOUNT_SERVICE,
];

export function isClientTeamAssignmentRole(
  role: AssignmentRole | string
): boolean {
  return (
    role === AssignmentRole.RELATIONSHIP || role === AssignmentRole.ACCOUNT_SERVICE
  );
}

export function formatAssignmentRoleLabel(role: AssignmentRole) {
  return ASSIGNMENT_ROLE_LABELS[role];
}

export function formatClientTeamAssignmentRoleLabel(role: AssignmentRole) {
  if (!isClientTeamAssignmentRole(role)) {
    return formatAssignmentRoleLabel(role);
  }

  return ASSIGNMENT_ROLE_LABELS[role];
}

export function formatClientTeamAssignmentRoles(roles: AssignmentRole[]) {
  const teamRoles = roles.filter(isClientTeamAssignmentRole);
  const uniqueRoles = [...new Set(teamRoles)];

  return uniqueRoles.map(formatClientTeamAssignmentRoleLabel).join(', ');
}

export function getRoleOccupancyLimitMessage(
  role: AssignmentRole,
  currentCount: number
) {
  const limit = ROLE_OCCUPANCY_LIMITS[role];
  if (currentCount < limit) {
    return null;
  }

  const roleLabel = ASSIGNMENT_ROLE_LABELS_PLURAL[role];
  return `Error: A client can have a maximum of ${limit} ${roleLabel}.`;
}

export function countAssignmentsForRole(
  assignedUsers: { role: string }[],
  role: AssignmentRole
) {
  return assignedUsers.filter((user) => user.role === role).length;
}

export function isRoleAtOccupancyLimit(
  assignedUsers: { role: string }[],
  role: AssignmentRole
) {
  return countAssignmentsForRole(assignedUsers, role) >= ROLE_OCCUPANCY_LIMITS[role];
}
