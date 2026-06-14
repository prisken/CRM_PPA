import { prisma } from '@/lib/prisma';

type ActivitySource = 'manual' | 'system';

type RawActivityItem = {
  activityId: string;
  clientId: string;
  clientName: string;
  log: string;
  timestamp: string;
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

async function fetchRawActivities(clientIds?: string[], perSourceLimit = 100) {
  const clientFilter = clientIds ? { clientId: { in: clientIds } } : undefined;

  const [interactions, activityLogs] = await Promise.all([
    prisma.interaction.findMany({
      where: clientFilter,
      orderBy: { date: 'desc' },
      take: perSourceLimit,
      include: {
        user: { select: { name: true, email: true } },
        client: { select: { id: true, name: true, company: true } },
      },
    }),
    prisma.clientActivityLog.findMany({
      where: clientFilter,
      orderBy: { createdAt: 'desc' },
      take: perSourceLimit,
      include: {
        user: { select: { name: true, email: true } },
        client: { select: { id: true, name: true, company: true } },
      },
    }),
  ]);

  const interactionItems: RawActivityItem[] = interactions.map((interaction) => ({
    activityId: interaction.id,
    clientId: interaction.client.id,
    clientName: interaction.client.company ?? interaction.client.name,
    log: formatActivityLog(
      interaction.content,
      interaction.user.name ?? interaction.user.email,
      interaction.client.name,
      interaction.type,
      'manual'
    ),
    timestamp: interaction.date.toISOString(),
  }));

  const systemItems: RawActivityItem[] = activityLogs.map((entry) => ({
    activityId: entry.id,
    clientId: entry.client.id,
    clientName: entry.client.company ?? entry.client.name,
    log: formatActivityLog(
      entry.content,
      entry.user?.name ?? entry.user?.email ?? null,
      entry.client.name,
      entry.type,
      'system'
    ),
    timestamp: entry.createdAt.toISOString(),
  }));

  return [...interactionItems, ...systemItems]
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
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
    perSourceLimit?: number;
  } = {}
) {
  const { clientIds, totalLimit = 50, perSourceLimit = 100 } = options;

  const rawActivities = await fetchRawActivities(clientIds, perSourceLimit).then(
    (items) => items.slice(0, totalLimit)
  );

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
