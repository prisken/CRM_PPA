import { AssignmentRole, ClientStatus } from '@prisma/client';
import { CLIENT_STAGES } from '@/lib/clientStages';

export const PIPELINE_STATUS_CHANGE_ALLOWED: Record<AssignmentRole, ClientStatus[]> = {
  RELATIONSHIP: [
    ClientStatus.NEW_LEAD,
    ClientStatus.CONTACTED,
    ClientStatus.NURTURING,
  ],
  DOCTOR: [ClientStatus.STRATEGY_SESSION],
  ACCOUNT_SERVICE: [ClientStatus.ACTIVE_CLIENT],
};

export function canAssignmentRoleChangePipelineStatus(
  role: AssignmentRole,
  currentStatus: ClientStatus
) {
  return PIPELINE_STATUS_CHANGE_ALLOWED[role].includes(currentStatus);
}

export function getNextPipelineStage(currentStatus: string) {
  const index = CLIENT_STAGES.findIndex((stage) => stage.value === currentStatus);
  if (index === -1 || index >= CLIENT_STAGES.length - 1) {
    return null;
  }

  return CLIENT_STAGES[index + 1].value;
}

export function canUserAdvancePipelineStage(
  assignmentRoles: string[],
  currentStatus: string
) {
  const nextStage = getNextPipelineStage(currentStatus);
  if (!nextStage) {
    return false;
  }

  return assignmentRoles.some((role) =>
    canAssignmentRoleChangePipelineStatus(role as AssignmentRole, currentStatus as ClientStatus)
  );
}

export const PIPELINE_ADVANCE_CHECKLIST: Record<string, string[]> = {
  NEW_LEAD: ['Initial contact completed', 'Lead qualification notes added'],
  CONTACTED: ['Follow-up scheduled', 'Key stakeholders identified'],
  NURTURING: ['Strategy session scheduled', 'Confirmed budget'],
  STRATEGY_SESSION: ['Strategy approved', 'Implementation plan documented'],
  ACTIVE_CLIENT: ['Onboarding checklist complete', 'Account handoff confirmed'],
};

export function getPipelineAdvanceChecklist(currentStatus: string) {
  return PIPELINE_ADVANCE_CHECKLIST[currentStatus] ?? ['Review completed before advancing'];
}
