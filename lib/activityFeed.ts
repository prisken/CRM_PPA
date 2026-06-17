import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type ActivitySource = 'manual' | 'system';

type RawActivityItem = {
  activityId: string;
  clientId: string;
  clientName: string;
  log: string;
  timestamp: string;
};

type UnifiedActivityRow = {
  activity_id: string;
  client_id: string;
  client_name: string;
  client_display_name: string;
  content: string;
  activity_type: string;
  source: ActivitySource;
  activity_date: Date;
  user_name: string | null;
  user_email: string | null;
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

function formatActivityLog(
  content: string,
  userName: string | null,
  clientName: string,
  type: string,
  source: ActivitySource
) {
  if (source === 'system') {
    return content;
  }

  if (type === 'NOTE') {
    const actor = userName ?? 'Someone';
    return `${actor} added a note to ${clientName}.`;
  }

  const actor = userName ?? 'Someone';
  const action = type.toLowerCase();
  return `${actor} logged a ${action} on ${clientName}.`;
}

async function fetchRawActivities(clientIds?: string[], limit = 100) {
  if (clientIds && clientIds.length === 0) {
    return [];
  }

  const clientFilter =
    clientIds && clientIds.length > 0
      ? Prisma.sql`AND i."clientId" IN (${Prisma.join(clientIds)})`
      : Prisma.empty;

  const systemClientFilter =
    clientIds && clientIds.length > 0
      ? Prisma.sql`AND cal.client_id IN (${Prisma.join(clientIds)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<UnifiedActivityRow[]>(Prisma.sql`
    SELECT *
    FROM (
      SELECT
        i.id AS activity_id,
        i."clientId" AS client_id,
        COALESCE(c.company, c.name) AS client_name,
        c.name AS client_display_name,
        i.content,
        i.type::text AS activity_type,
        'manual'::text AS source,
        i.date AS activity_date,
        u.name AS user_name,
        u.email AS user_email
      FROM "Interaction" i
      INNER JOIN "Client" c ON c.id = i."clientId"
      INNER JOIN "User" u ON u.id = i."userId"
      WHERE 1 = 1
      ${clientFilter}

      UNION ALL

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
    ) AS combined
    ORDER BY activity_date DESC
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
  }));
}

async function loadReadActivityIds(userId: string, activityIds: string[]) {
  if (activityIds.length === 0) {
    return new Set<string>();
  }

  const readEntries = await prisma.activityReadStatus.findMany({
    where: {
      userId,
      activityLogId: { in: activityIds },
    },
    select: { activityLogId: true },
  });

  return new Set(readEntries.map((entry) => entry.activityLogId));
}

export async function buildGroupedRecentActivity(
  userId: string,
  options: {
    clientIds?: string[];
    totalLimit?: number;
  } = {}
) {
  const { clientIds, totalLimit = 50 } = options;

  const rawActivities = await fetchRawActivities(clientIds, totalLimit);

  const readActivityIds = await loadReadActivityIds(
    userId,
    rawActivities.map((item) => item.activityId)
  );

  const grouped = new Map<string, GroupedClientActivity>();

  for (const item of rawActivities) {
    const existing = grouped.get(item.clientId);
    const activity: ActivityFeedItem = {
      activityId: item.activityId,
      log: item.log,
      timestamp: item.timestamp,
      isUnread: !readActivityIds.has(item.activityId),
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
