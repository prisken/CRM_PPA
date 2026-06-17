import {
  buildActivityFeedWidget,
  buildAssignedClientsWidget,
  buildOpenTasksWidget,
  buildPerformanceMetricsWidget,
} from '@/lib/standardDashboardWidgets';

export async function buildStandardDashboard(userId: string) {
  const [assignedClientsData, openTasksData, recentActivityData, performanceData] =
    await Promise.all([
      buildAssignedClientsWidget(userId),
      buildOpenTasksWidget(userId),
      buildActivityFeedWidget(userId),
      buildPerformanceMetricsWidget(userId),
    ]);

  return {
    ...assignedClientsData,
    ...openTasksData,
    ...recentActivityData,
    performanceMetrics: performanceData.performanceMetrics,
  };
}
