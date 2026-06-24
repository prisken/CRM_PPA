import { loadStandardDashboardContext } from '@/lib/standardDashboardContext';
import {
  buildActivityFeedWidget,
  buildAssignedClientsWidget,
  buildOpenTasksWidget,
  buildPerformanceMetricsWidget,
} from '@/lib/standardDashboardWidgets';
import { timeAsync } from '@/lib/performance';

export async function buildStandardDashboard(userId: string) {
  return timeAsync('dashboard:buildStandard', async () => {
    const context = await loadStandardDashboardContext(userId);

    const [assignedClientsData, openTasksData, recentActivityData, performanceData] =
      await Promise.all([
        buildAssignedClientsWidget(userId, context),
        buildOpenTasksWidget(userId, context),
        buildActivityFeedWidget(userId, context),
        buildPerformanceMetricsWidget(userId, context),
      ]);

    return {
      ...assignedClientsData,
      ...openTasksData,
      ...recentActivityData,
      performanceMetrics: performanceData.performanceMetrics,
    };
  });
}
