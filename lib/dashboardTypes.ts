export type AssignedClientRow = {
  clientId: string;
  clientName: string;
  myRole: string;
  clientStatus: string;
  dealValue: number;
};

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
  myPotentialCommission: number;
};

export type StandardDashboardData = {
  assignedClients: AssignedClientRow[];
  openTasks: OpenTaskRow[];
  recentActivity: GroupedClientActivity[];
  performanceMetrics: PerformanceMetrics;
};

export type SuperAdminDashboardData = {
  recentActivity: GroupedClientActivity[];
};
