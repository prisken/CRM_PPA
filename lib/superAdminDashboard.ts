import { buildGroupedRecentActivity } from '@/lib/activityFeed';
import { timeAsync } from '@/lib/performance';

const SUPER_ADMIN_ACTIVITY_LIMIT = 100;

export async function buildSuperAdminDashboard(userId: string) {
  return timeAsync(
    'builder:buildSuperAdminDashboard',
    async () => {
      const recentActivity = await buildGroupedRecentActivity(userId, {
        totalLimit: SUPER_ADMIN_ACTIVITY_LIMIT,
      });

      return { recentActivity };
    },
    (result) => ({
      userId,
      groupCount: result.recentActivity.length,
    })
  );
}
