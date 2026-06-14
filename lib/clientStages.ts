export const CLIENT_STAGES = [
  { value: 'NEW_LEAD', label: 'New Lead' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'NURTURING', label: 'Nurturing' },
  { value: 'STRATEGY_SESSION', label: 'Strategy Session' },
  { value: 'ACTIVE_CLIENT', label: 'Active Client' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

export function formatClientStage(status: string) {
  return CLIENT_STAGES.find((stage) => stage.value === status)?.label ?? status;
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  NEW_LEAD: 'bg-blue-100 text-blue-800',
  CONTACTED: 'bg-amber-100 text-amber-800',
  NURTURING: 'bg-purple-100 text-purple-800',
  STRATEGY_SESSION: 'bg-indigo-100 text-indigo-800',
  ACTIVE_CLIENT: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-gray-100 text-gray-600',
};

export function getStatusBadgeStyles(status: string) {
  return STATUS_BADGE_STYLES[status] ?? 'bg-gray-100 text-gray-700';
}
