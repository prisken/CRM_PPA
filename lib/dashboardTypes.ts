export type DealParticipationRow = {
  dealId: string;
  dealName: string;
  clientId: string;
  clientName: string;
  status: string;
  dealType: string;
  myRoles: string[];
  myCommissionPercent: number;
  myCommissionAmount: number;
};

export type AssignedClientRow = {
  clientId: string;
  clientName: string;
  myRole: string;
  myRoles: string[];
  clientStatus: string;
  dealValue: number;
};

export type LegacyAssignedClientRow = AssignedClientRow;

export type OpenTaskRow = {
  taskId: string;
  clientId: string;
  description: string;
  clientName: string;
  dueDate: string | null;
};

export type ActivityFeedItem = {
  activityId: string;
  log: string;
  timestamp: string;
  isUnread: boolean;
};

export type GroupedClientActivity = {
  clientId: string;
  clientName: string;
  activities: ActivityFeedItem[];
};

export type PerformanceMetrics = {
  totalActiveClients: number;
  totalPipelineValue: number;
  mySecuredCommission: number;
};

export type StandardDashboardData = {
  assignedClients: AssignedClientRow[];
  legacyDoctorAssignments?: LegacyAssignedClientRow[];
  openTasks: OpenTaskRow[];
  recentActivity: GroupedClientActivity[];
  performanceMetrics: PerformanceMetrics;
};

export type SuperAdminDashboardData = {
  recentActivity: GroupedClientActivity[];
};
