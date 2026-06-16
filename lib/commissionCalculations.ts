import { AssignmentRole, DealStatus } from '@prisma/client';
import {
  COMMISSION_RATE_POOLS,
  countAssignmentsForRole,
} from '@/lib/constants';

type AssignedUserLike = {
  user_id: string;
  role: string;
};

type DealCommissionInput = {
  totalCommission: { toString(): string } | number;
  status: DealStatus | string;
};

export function calculateIndividualRoleShare(
  role: AssignmentRole,
  roleOccupancy: number
) {
  if (roleOccupancy <= 0) {
    return 0;
  }

  return COMMISSION_RATE_POOLS[role] / roleOccupancy;
}

export function calculateUserClientCommissionShare(
  userId: string,
  assignedUsers: AssignedUserLike[]
) {
  const userAssignments = assignedUsers.filter(
    (assignment) => assignment.user_id === userId
  );

  return userAssignments.reduce((totalShare, assignment) => {
    const role = assignment.role as AssignmentRole;
    const roleOccupancy = countAssignmentsForRole(assignedUsers, role);
    return totalShare + calculateIndividualRoleShare(role, roleOccupancy);
  }, 0);
}

export function calculateAssignmentSecuredCommission(
  deals: DealCommissionInput[],
  role: AssignmentRole,
  roleOccupancy: number
) {
  const individualShare = calculateIndividualRoleShare(role, roleOccupancy);

  return deals
    .filter((deal) => deal.status === DealStatus.WON)
    .reduce(
      (total, deal) => total + Number(deal.totalCommission) * individualShare,
      0
    );
}

export function buildRoleOccupancyMap(
  assignments: { clientId: string; role: AssignmentRole | string }[]
) {
  const occupancyMap = new Map<string, number>();

  for (const assignment of assignments) {
    const key = `${assignment.clientId}:${assignment.role}`;
    occupancyMap.set(key, (occupancyMap.get(key) ?? 0) + 1);
  }

  return occupancyMap;
}

export function getRoleOccupancy(
  occupancyMap: Map<string, number>,
  clientId: string,
  role: AssignmentRole | string
) {
  return occupancyMap.get(`${clientId}:${role}`) ?? 0;
}
