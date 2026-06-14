import { AssignmentRole } from '@prisma/client';

export const COMMISSION_RATES: Record<AssignmentRole, number> = {
  RELATIONSHIP: 0.15,
  DOCTOR: 0.1,
  ACCOUNT_SERVICE: 0.1,
};

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  RELATIONSHIP: 'Relationship',
  DOCTOR: 'Doctor',
  ACCOUNT_SERVICE: 'Account Service',
};

export function formatAssignmentRole(role: AssignmentRole) {
  return ASSIGNMENT_ROLE_LABELS[role];
}
