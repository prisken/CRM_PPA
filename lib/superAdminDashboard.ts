import { buildGroupedRecentActivity } from '@/lib/activityFeed';

const SUPER_ADMIN_ACTIVITY_LIMIT = 100;

export async function buildSuperAdminDashboard(userId: string) {
  const recentActivity = await buildGroupedRecentActivity(userId, {
    totalLimit: SUPER_ADMIN_ACTIVITY_LIMIT,
  });

  return { recentActivity };
}
