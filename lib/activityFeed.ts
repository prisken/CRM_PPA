import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { timeAsync } from '@/lib/performance';

type ActivitySource = 'manual' | 'system';

type UnifiedActivityRow = {
  activity_id: string;
  client_id: string;
  client_name: string;
  client_display_name: string;
  content: string | null;
  activity_type: string;
  source: ActivitySource;
  activity_date: Date;
  user_name: string | null;
  user_email: string | null;
  is_unread: boolean;
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

type FetchRawActivitiesOptions = {
  userId: string;
  limit: number;
  clientIds?: string[];
  assignedUserId?: string;
};

function formatActivityLog(
  content: string | null,
  userName: string | null,
  clientName: string,
  type: string,
  source: ActivitySource
) {
  if (source === 'system') {
    return content ?? '';
  }

  if (type === 'NOTE') {
    const actor = userName ?? 'Someone';
    return `${actor} added a note to ${clientName}.`;
  }

  const actor = userName ?? 'Someone';
  const action = type.toLowerCase();
  return `${actor} logged a ${action} on ${clientName}.`;
}

function buildClientScopeFilters(options: {
  clientIds?: string[];
  assignedUserId?: string;
}) {
  const { clientIds, assignedUserId } = options;

  if (assignedUserId) {
    const assignmentScope = Prisma.sql`(
      SELECT ca.client_id
      FROM client_assignments ca
      WHERE ca.user_id = ${assignedUserId}
    )`;

    return {
      manual: Prisma.sql`AND i."clientId" IN ${assignmentScope}`,
      system: Prisma.sql`AND cal.client_id IN ${assignmentScope}`,
    };
  }

  if (clientIds && clientIds.length > 0) {
    return {
      manual: Prisma.sql`AND i."clientId" IN (${Prisma.join(clientIds)})`,
      system: Prisma.sql`AND cal.client_id IN (${Prisma.join(clientIds)})`,
    };
  }

  return { manual: Prisma.empty, system: Prisma.empty };
}

async function fetchRawActivities(options: FetchRawActivitiesOptions) {
  const { userId, limit, clientIds, assignedUserId } = options;

  return timeAsync(
    'activityFeed:fetchRawActivities',
    async () => {
      if (!assignedUserId && clientIds && clientIds.length === 0) {
        return [];
      }

      const { manual: manualClientFilter, system: systemClientFilter } =
        buildClientScopeFilters({ clientIds, assignedUserId });

      const rows = await prisma.$queryRaw<UnifiedActivityRow[]>(Prisma.sql`
        SELECT
          combined.activity_id,
          combined.client_id,
          combined.client_name,
          combined.client_display_name,
          combined.content,
          combined.activity_type,
          combined.source,
          combined.activity_date,
          combined.user_name,
          combined.user_email,
          (ars.activity_log_id IS NULL) AS is_unread
        FROM (
          (
            SELECT
              i.id AS activity_id,
              i."clientId" AS client_id,
              COALESCE(c.company, c.name) AS client_name,
              c.name AS client_display_name,
              NULL::text AS content,
              i.type::text AS activity_type,
              'manual'::text AS source,
              i.date AS activity_date,
              u.name AS user_name,
              u.email AS user_email
            FROM "Interaction" i
            INNER JOIN "Client" c ON c.id = i."clientId"
            INNER JOIN "User" u ON u.id = i."userId"
            WHERE 1 = 1
            ${manualClientFilter}
            ORDER BY i.date DESC
            LIMIT ${limit}
          )
          UNION ALL
          (
            SELECT
              cal.id AS activity_id,
              cal.client_id AS client_id,
              COALESCE(c.company, c.name) AS client_name,
              c.name AS client_display_name,
              cal.content,
              cal.type::text AS activity_type,
              'system'::text AS source,
              cal.created_at AS activity_date,
              u.name AS user_name,
              u.email AS user_email
            FROM client_activity_logs cal
            INNER JOIN "Client" c ON c.id = cal.client_id
            LEFT JOIN "User" u ON u.id = cal.user_id
            WHERE 1 = 1
            ${systemClientFilter}
            ORDER BY cal.created_at DESC
            LIMIT ${limit}
          )
        ) AS combined
        LEFT JOIN activity_read_status ars
          ON ars.activity_log_id = combined.activity_id
          AND ars.user_id = ${userId}
        ORDER BY combined.activity_date DESC
        LIMIT ${limit}
      `);

      return rows.map((row) => ({
        activityId: row.activity_id,
        clientId: row.client_id,
        clientName: row.client_name,
        log: formatActivityLog(
          row.content,
          row.user_name ?? row.user_email,
          row.client_display_name,
          row.activity_type,
          row.source
        ),
        timestamp: row.activity_date.toISOString(),
        isUnread: row.is_unread,
      }));
    },
    (result) => ({
      limit,
      clientScopeCount: clientIds?.length ?? null,
      usesAssignmentScope: Boolean(assignedUserId),
      activityCount: result.length,
    })
  );
}

export async function buildGroupedRecentActivity(
  userId: string,
  options: {
    clientIds?: string[];
    assignedUserId?: string;
    totalLimit?: number;
  } = {}
) {
  const { clientIds, assignedUserId, totalLimit = 50 } = options;

  return timeAsync(
    'activityFeed:buildGroupedRecentActivity',
    async () => {
      const rawActivities = await fetchRawActivities({
        userId,
        limit: totalLimit,
        clientIds,
        assignedUserId,
      });

      const grouped = new Map<string, GroupedClientActivity>();

      for (const item of rawActivities) {
        const existing = grouped.get(item.clientId);
        const activity: ActivityFeedItem = {
          activityId: item.activityId,
          log: item.log,
          timestamp: item.timestamp,
          isUnread: item.isUnread,
        };

        if (existing) {
          existing.activities.push(activity);
          continue;
        }

        grouped.set(item.clientId, {
          clientId: item.clientId,
          clientName: item.clientName,
          activities: [activity],
        });
      }

      return Array.from(grouped.values()).sort((a, b) => {
        const aLatest = a.activities[0]?.timestamp ?? '';
        const bLatest = b.activities[0]?.timestamp ?? '';
        return new Date(bLatest).getTime() - new Date(aLatest).getTime();
      });
    },
    (result) => ({
      userId,
      totalLimit,
      clientScopeCount: clientIds?.length ?? null,
      usesAssignmentScope: Boolean(assignedUserId),
      groupCount: result.length,
    })
  );
}

export async function markActivitiesAsRead(userId: string, activityLogIds: string[]) {
  const uniqueIds = [...new Set(activityLogIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { marked: 0 };
  }

  const result = await prisma.activityReadStatus.createMany({
    data: uniqueIds.map((activityLogId) => ({
      activityLogId,
      userId,
    })),
    skipDuplicates: true,
  });

  return { marked: result.count };
}
