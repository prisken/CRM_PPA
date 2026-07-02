import {
  ClientStatus,
  LeadSourceType,
  Prisma,
} from '@prisma/client';
import {
  compactString,
  normalizeEmail,
  normalizePhone,
} from '@/lib/leadNormalization';
import { prisma } from '@/lib/prisma';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const LEAD_SOURCE_LABELS: Record<LeadSourceType, string> = {
  [LeadSourceType.GOOGLE_FORMS]: 'Google Forms',
  [LeadSourceType.PROFIT_PULSE_ALLY]: 'Profit Pulse Ally',
  [LeadSourceType.MANUAL]: 'Manual',
  [LeadSourceType.OTHER]: 'Other',
};

export type LeadCommandCenterAssignedUser = {
  assignmentId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
};

export type LeadCommandCenterSource = {
  source: string;
  externalId: string | null;
  receivedAt: string;
};

export type LeadCommandCenterTag = {
  id: string;
  name: string;
  color: string | null;
};

export type LeadCommandCenterRow = {
  clientId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  leadSource: string | null;
  roleInCompany: string | null;
  employeeCount: number | null;
  expectations: string | null;
  createdAt: string;
  lastModified: string;
  assignedUsers: LeadCommandCenterAssignedUser[];
  sources: LeadCommandCenterSource[];
  sourceLabels: string[];
  firstSourceLabel: string | null;
  latestSourceLabel: string | null;
  latestSourceReceivedAt: string | null;
  sourceRecordCount: number;
  lastActivityAt: string | null;
  lastActivitySummary: string | null;
  attentionScore: number;
  attentionReasons: string[];
  dataQualityWarnings: string[];
  duplicateWarnings: string[];
  tags: LeadCommandCenterTag[];
  priority: string | null;
  nextAction: string | null;
  nextFollowUpAt: string | null;
};

export type LeadCommandCenterFilters = {
  search?: string;
  statuses?: string[];
  sources?: string[];
  assignedUserId?: string;
  missingEmail?: boolean;
  missingPhone?: boolean;
  unassigned?: boolean;
  duplicateEmail?: boolean;
  duplicatePhone?: boolean;
  needsAttention?: boolean;
  createdFrom?: string;
  createdTo?: string;
  latestSourceFrom?: string;
  latestSourceTo?: string;
  tagIds?: string[];
  tagNames?: string[];
  overdueFollowUp?: boolean;
  dueToday?: boolean;
  noNextAction?: boolean;
  limit?: number;
  offset?: number;
};

type ClientWithRelations = Prisma.ClientGetPayload<{
  include: {
    clientAssignments: {
      include: {
        user: {
          select: {
            id: true;
            name: true;
            email: true;
          };
        };
      };
    };
    sourceRecords: {
      select: {
        source: true;
        externalId: true;
        receivedAt: true;
      };
    };
    tags: {
      include: {
        tag: {
          select: {
            id: true;
            name: true;
            color: true;
          };
        };
      };
    };
  };
}>;

type LatestActivityRow = {
  client_id: string;
  activity_date: Date;
  activity_type: string;
  content: string | null;
  activity_source: 'manual' | 'system';
  user_name: string | null;
  user_email: string | null;
};

type DuplicateClientIds = {
  emailDuplicates: Set<string>;
  phoneDuplicates: Set<string>;
};

function formatSourceLabel(source: LeadSourceType | string): string {
  if (source in LEAD_SOURCE_LABELS) {
    return LEAD_SOURCE_LABELS[source as LeadSourceType];
  }

  return String(source).replace(/_/g, ' ');
}

function parseFilterDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  }

  return parsed;
}

function isMissingEmail(email: string | null | undefined) {
  return normalizeEmail(email) === null;
}

function isMissingPhone(phone: string | null | undefined) {
  return normalizePhone(phone) === null;
}

function isMissingCompany(company: string | null | undefined) {
  return compactString(company) === null;
}

function getTodayRange(reference = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);

  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isFollowUpDueToday(nextFollowUpAt: Date, reference = new Date()) {
  const { start, end } = getTodayRange(reference);
  return nextFollowUpAt >= start && nextFollowUpAt <= end;
}

function hasNoNextAction(nextAction: string | null | undefined) {
  return compactString(nextAction) === null;
}

function parseLeadSourceTypes(sources: string[] | undefined): LeadSourceType[] {
  if (!sources || sources.length === 0) {
    return [];
  }

  const allowed = new Set<string>(Object.values(LeadSourceType));
  return sources.filter((source): source is LeadSourceType => allowed.has(source));
}

function buildClientWhere(filters: LeadCommandCenterFilters): Prisma.ClientWhereInput {
  const and: Prisma.ClientWhereInput[] = [];

  const includeArchived = filters.statuses?.includes(ClientStatus.ARCHIVED) === true;

  if (filters.statuses && filters.statuses.length > 0) {
    and.push({
      status: {
        in: filters.statuses as ClientStatus[],
      },
    });
  } else if (!includeArchived) {
    and.push({
      status: {
        not: ClientStatus.ARCHIVED,
      },
    });
  }

  if (filters.assignedUserId) {
    and.push({
      clientAssignments: {
        some: {
          userId: filters.assignedUserId,
        },
      },
    });
  }

  if (filters.missingEmail) {
    and.push({
      OR: [{ email: null }, { email: '' }],
    });
  }

  if (filters.missingPhone) {
    and.push({
      OR: [{ phone: null }, { phone: '' }],
    });
  }

  if (filters.unassigned) {
    and.push({
      clientAssignments: {
        none: {},
      },
    });
  }

  const sourceTypes = parseLeadSourceTypes(filters.sources);
  if (sourceTypes.length > 0) {
    and.push({
      sourceRecords: {
        some: {
          source: {
            in: sourceTypes,
          },
        },
      },
    });
  }

  if (filters.tagIds && filters.tagIds.length > 0) {
    and.push({
      tags: {
        some: {
          tagId: {
            in: filters.tagIds,
          },
        },
      },
    });
  }

  const tagNames = filters.tagNames
    ?.map((name) => name.trim())
    .filter(Boolean);
  if (tagNames && tagNames.length > 0) {
    and.push({
      tags: {
        some: {
          tag: {
            name: {
              in: tagNames,
            },
          },
        },
      },
    });
  }

  if (filters.overdueFollowUp) {
    and.push({
      nextFollowUpAt: {
        lt: new Date(),
      },
    });
  }

  if (filters.dueToday) {
    const { start, end } = getTodayRange();
    and.push({
      nextFollowUpAt: {
        gte: start,
        lte: end,
      },
    });
  }

  if (filters.noNextAction) {
    and.push({
      status: ClientStatus.NEW_LEAD,
      OR: [{ nextAction: null }, { nextAction: '' }],
    });
  }

  const createdFrom = parseFilterDate(filters.createdFrom);
  if (createdFrom) {
    and.push({
      createdAt: {
        gte: createdFrom,
      },
    });
  }

  const createdTo = parseFilterDate(filters.createdTo, true);
  if (createdTo) {
    and.push({
      createdAt: {
        lte: createdTo,
      },
    });
  }

  const search = filters.search?.trim();
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { leadSource: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (and.length === 0) {
    return {};
  }

  return { AND: and };
}

async function loadDuplicateClientIds(): Promise<DuplicateClientIds> {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      email: true,
      phone: true,
    },
  });

  const emailGroups = new Map<string, string[]>();
  const phoneGroups = new Map<string, string[]>();

  for (const client of clients) {
    const normalizedEmail = normalizeEmail(client.email);
    if (normalizedEmail) {
      const group = emailGroups.get(normalizedEmail) ?? [];
      group.push(client.id);
      emailGroups.set(normalizedEmail, group);
    }

    const normalizedPhone = normalizePhone(client.phone);
    if (normalizedPhone) {
      const group = phoneGroups.get(normalizedPhone) ?? [];
      group.push(client.id);
      phoneGroups.set(normalizedPhone, group);
    }
  }

  const emailDuplicates = new Set<string>();
  const phoneDuplicates = new Set<string>();

  for (const clientIds of emailGroups.values()) {
    if (clientIds.length > 1) {
      for (const clientId of clientIds) {
        emailDuplicates.add(clientId);
      }
    }
  }

  for (const clientIds of phoneGroups.values()) {
    if (clientIds.length > 1) {
      for (const clientId of clientIds) {
        phoneDuplicates.add(clientId);
      }
    }
  }

  return { emailDuplicates, phoneDuplicates };
}

function formatActivitySummary(
  activity: LatestActivityRow,
  clientName: string
): string {
  const actor = activity.user_name ?? activity.user_email ?? 'Someone';

  if (activity.activity_source === 'system') {
    return activity.content?.trim() || 'System activity logged.';
  }

  if (activity.activity_type === 'NOTE') {
    return `${actor} added a note to ${clientName}.`;
  }

  return `${actor} logged a ${activity.activity_type.toLowerCase()} on ${clientName}.`;
}

async function loadLatestActivitiesByClientId(
  clientIds: string[]
): Promise<Map<string, LatestActivityRow>> {
  if (clientIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<LatestActivityRow[]>(Prisma.sql`
    WITH combined AS (
      SELECT
        i."clientId" AS client_id,
        i.date AS activity_date,
        i.type::text AS activity_type,
        NULL::text AS content,
        'manual'::text AS activity_source,
        u.name AS user_name,
        u.email AS user_email
      FROM "Interaction" i
      INNER JOIN "User" u ON u.id = i."userId"
      WHERE i."clientId" IN (${Prisma.join(clientIds)})
      UNION ALL
      SELECT
        cal.client_id AS client_id,
        cal.created_at AS activity_date,
        cal.type::text AS activity_type,
        cal.content,
        'system'::text AS activity_source,
        u.name AS user_name,
        u.email AS user_email
      FROM client_activity_logs cal
      LEFT JOIN "User" u ON u.id = cal.user_id
      WHERE cal.client_id IN (${Prisma.join(clientIds)})
    ),
    ranked AS (
      SELECT
        combined.*,
        ROW_NUMBER() OVER (
          PARTITION BY combined.client_id
          ORDER BY combined.activity_date DESC
        ) AS row_number
      FROM combined
    )
    SELECT
      client_id,
      activity_date,
      activity_type,
      content,
      activity_source,
      user_name,
      user_email
    FROM ranked
    WHERE row_number = 1
  `);

  const activityByClientId = new Map<string, LatestActivityRow>();
  for (const row of rows) {
    activityByClientId.set(row.client_id, row);
  }

  return activityByClientId;
}

function buildSourcePresentation(
  sourceRecords: ClientWithRelations['sourceRecords'],
  leadSource: string | null
) {
  const sources: LeadCommandCenterSource[] = sourceRecords.map((record) => ({
    source: record.source,
    externalId: record.externalId,
    receivedAt: record.receivedAt.toISOString(),
  }));

  const sourceLabels = [
    ...new Set(sourceRecords.map((record) => formatSourceLabel(record.source))),
  ];

  const fallbackLabel = compactString(leadSource);
  const firstRecord = sourceRecords[sourceRecords.length - 1] ?? null;
  const latestRecord = sourceRecords[0] ?? null;

  const firstSourceLabel = firstRecord
    ? formatSourceLabel(firstRecord.source)
    : fallbackLabel;
  const latestSourceLabel = latestRecord
    ? formatSourceLabel(latestRecord.source)
    : fallbackLabel;
  const latestSourceReceivedAt = latestRecord?.receivedAt.toISOString() ?? null;

  const resolvedSourceLabels =
    sourceLabels.length > 0
      ? sourceLabels
      : fallbackLabel
        ? [fallbackLabel]
        : [];

  return {
    sources,
    sourceLabels: resolvedSourceLabels,
    firstSourceLabel,
    latestSourceLabel,
    latestSourceReceivedAt,
    sourceRecordCount: sourceRecords.length,
  };
}

function buildDataQualityWarnings(input: {
  email: string | null;
  phone: string | null;
  company: string | null;
  assignedUserCount: number;
  sourceRecordCount: number;
}) {
  const warnings: string[] = [];

  if (isMissingEmail(input.email)) {
    warnings.push('Missing email');
  }

  if (isMissingPhone(input.phone)) {
    warnings.push('Missing phone');
  }

  if (isMissingCompany(input.company)) {
    warnings.push('Missing company');
  }

  if (input.assignedUserCount === 0) {
    warnings.push('No assigned owner');
  }

  if (input.sourceRecordCount === 0) {
    warnings.push('No source record');
  }

  return warnings;
}

function buildDuplicateWarnings(
  clientId: string,
  duplicateClientIds: DuplicateClientIds
) {
  const warnings: string[] = [];

  if (duplicateClientIds.emailDuplicates.has(clientId)) {
    warnings.push('Duplicate email');
  }

  if (duplicateClientIds.phoneDuplicates.has(clientId)) {
    warnings.push('Duplicate phone');
  }

  return warnings;
}

function computeAttention(input: {
  status: string;
  email: string | null;
  phone: string | null;
  assignedUserCount: number;
  sourceRecordCount: number;
  latestSourceReceivedAt: string | null;
  lastActivityAt: string | null;
  lastModified: string;
  duplicateWarnings: string[];
  nextAction: string | null;
  nextFollowUpAt: string | null;
}) {
  let attentionScore = 0;
  const attentionReasons: string[] = [];
  const now = Date.now();

  const hasActivity = input.lastActivityAt !== null;

  if (input.status === ClientStatus.NEW_LEAD && !hasActivity) {
    attentionScore += 30;
    attentionReasons.push('New lead with no activity');
  }

  if (isMissingEmail(input.email)) {
    attentionScore += 20;
    attentionReasons.push('Missing email');
  }

  if (isMissingPhone(input.phone)) {
    attentionScore += 15;
    attentionReasons.push('Missing phone');
  }

  if (input.assignedUserCount === 0) {
    attentionScore += 25;
    attentionReasons.push('No assigned owner');
  }

  if (input.sourceRecordCount === 0) {
    attentionScore += 10;
    attentionReasons.push('No source record');
  }

  if (input.latestSourceReceivedAt) {
    const receivedAt = new Date(input.latestSourceReceivedAt).getTime();
    if (!Number.isNaN(receivedAt) && now - receivedAt <= 24 * MS_PER_HOUR) {
      attentionScore += 20;
      attentionReasons.push('New source update');
    }
  }

  if (input.duplicateWarnings.includes('Duplicate email')) {
    attentionScore += 30;
    attentionReasons.push('Duplicate email');
  }

  if (input.duplicateWarnings.includes('Duplicate phone')) {
    attentionScore += 25;
    attentionReasons.push('Duplicate phone');
  }

  if (
    input.status !== ClientStatus.ARCHIVED &&
    (!input.lastActivityAt ||
      now - new Date(input.lastActivityAt).getTime() >= 7 * MS_PER_DAY)
  ) {
    attentionScore += 15;
    attentionReasons.push('No activity for 7 days');
  }

  if (input.status === ClientStatus.NURTURING) {
    const nurturingReference = new Date(input.lastModified).getTime();
    if (
      !Number.isNaN(nurturingReference) &&
      now - nurturingReference >= 30 * MS_PER_DAY
    ) {
      attentionScore += 10;
      attentionReasons.push('Nurturing for 30+ days');
    }
  }

  if (input.nextFollowUpAt) {
    const followUpAt = new Date(input.nextFollowUpAt);
    if (!Number.isNaN(followUpAt.getTime())) {
      if (followUpAt.getTime() < now) {
        attentionScore += 30;
        attentionReasons.push('Follow-up overdue');
      } else if (isFollowUpDueToday(followUpAt, new Date(now))) {
        attentionScore += 20;
        attentionReasons.push('Follow-up due today');
      }
    }
  }

  if (input.status === ClientStatus.NEW_LEAD && hasNoNextAction(input.nextAction)) {
    attentionScore += 10;
    attentionReasons.push('No next action');
  }

  return { attentionScore, attentionReasons };
}

function matchesLatestSourceDateFilters(
  latestSourceReceivedAt: string | null,
  filters: LeadCommandCenterFilters
) {
  const latestSourceFrom = parseFilterDate(filters.latestSourceFrom);
  const latestSourceTo = parseFilterDate(filters.latestSourceTo, true);

  if (!latestSourceFrom && !latestSourceTo) {
    return true;
  }

  if (!latestSourceReceivedAt) {
    return false;
  }

  const receivedAt = new Date(latestSourceReceivedAt);
  if (Number.isNaN(receivedAt.getTime())) {
    return false;
  }

  if (latestSourceFrom && receivedAt < latestSourceFrom) {
    return false;
  }

  if (latestSourceTo && receivedAt > latestSourceTo) {
    return false;
  }

  return true;
}

function sortRows(rows: LeadCommandCenterRow[]) {
  rows.sort((left, right) => {
    if (right.attentionScore !== left.attentionScore) {
      return right.attentionScore - left.attentionScore;
    }

    const rightLatestSource = right.latestSourceReceivedAt
      ? new Date(right.latestSourceReceivedAt).getTime()
      : 0;
    const leftLatestSource = left.latestSourceReceivedAt
      ? new Date(left.latestSourceReceivedAt).getTime()
      : 0;

    if (rightLatestSource !== leftLatestSource) {
      return rightLatestSource - leftLatestSource;
    }

    return (
      new Date(right.lastModified).getTime() - new Date(left.lastModified).getTime()
    );
  });
}

function mapClientToRow(
  client: ClientWithRelations,
  duplicateClientIds: DuplicateClientIds,
  latestActivity: LatestActivityRow | undefined
): LeadCommandCenterRow {
  const assignedUsers: LeadCommandCenterAssignedUser[] = client.clientAssignments.map(
    (assignment) => ({
      assignmentId: assignment.assignmentId,
      userId: assignment.user.id,
      name: assignment.user.name ?? assignment.user.email,
      email: assignment.user.email,
      role: assignment.role,
    })
  );

  const sourcePresentation = buildSourcePresentation(
    client.sourceRecords,
    client.leadSource
  );

  const dataQualityWarnings = buildDataQualityWarnings({
    email: client.email,
    phone: client.phone,
    company: client.company,
    assignedUserCount: assignedUsers.length,
    sourceRecordCount: sourcePresentation.sourceRecordCount,
  });

  const duplicateWarnings = buildDuplicateWarnings(client.id, duplicateClientIds);

  const lastActivityAt = latestActivity?.activity_date.toISOString() ?? null;
  const lastActivitySummary = latestActivity
    ? formatActivitySummary(latestActivity, client.name)
    : null;

  const { attentionScore, attentionReasons } = computeAttention({
    status: client.status,
    email: client.email,
    phone: client.phone,
    assignedUserCount: assignedUsers.length,
    sourceRecordCount: sourcePresentation.sourceRecordCount,
    latestSourceReceivedAt: sourcePresentation.latestSourceReceivedAt,
    lastActivityAt,
    lastModified: client.lastModified.toISOString(),
    duplicateWarnings,
    nextAction: client.nextAction,
    nextFollowUpAt: client.nextFollowUpAt?.toISOString() ?? null,
  });

  return {
    clientId: client.id,
    name: client.name,
    company: client.company,
    email: client.email,
    phone: client.phone,
    status: client.status,
    leadSource: client.leadSource,
    roleInCompany: client.roleInCompany,
    employeeCount: client.employeeCount,
    expectations: client.expectations,
    createdAt: client.createdAt.toISOString(),
    lastModified: client.lastModified.toISOString(),
    assignedUsers,
    sources: sourcePresentation.sources,
    sourceLabels: sourcePresentation.sourceLabels,
    firstSourceLabel: sourcePresentation.firstSourceLabel,
    latestSourceLabel: sourcePresentation.latestSourceLabel,
    latestSourceReceivedAt: sourcePresentation.latestSourceReceivedAt,
    sourceRecordCount: sourcePresentation.sourceRecordCount,
    lastActivityAt,
    lastActivitySummary,
    attentionScore,
    attentionReasons,
    dataQualityWarnings,
    duplicateWarnings,
    tags: client.tags
      .map((clientTag) => clientTag.tag)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
      })),
    priority: client.priority,
    nextAction: client.nextAction,
    nextFollowUpAt: client.nextFollowUpAt?.toISOString() ?? null,
  };
}

function applyPostFilters(
  rows: LeadCommandCenterRow[],
  filters: LeadCommandCenterFilters
) {
  return rows.filter((row) => {
    if (filters.duplicateEmail && !row.duplicateWarnings.includes('Duplicate email')) {
      return false;
    }

    if (filters.duplicatePhone && !row.duplicateWarnings.includes('Duplicate phone')) {
      return false;
    }

    if (filters.needsAttention && row.attentionScore <= 0) {
      return false;
    }

    if (!matchesLatestSourceDateFilters(row.latestSourceReceivedAt, filters)) {
      return false;
    }

    return true;
  });
}

export async function fetchLeadCommandCenterRows(
  filters: LeadCommandCenterFilters = {}
): Promise<LeadCommandCenterRow[]> {
  const where = buildClientWhere(filters);

  const [clients, duplicateClientIds] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        clientAssignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        sourceRecords: {
          orderBy: { receivedAt: 'desc' },
          select: {
            source: true,
            externalId: true,
            receivedAt: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    }),
    loadDuplicateClientIds(),
  ]);

  const latestActivities = await loadLatestActivitiesByClientId(
    clients.map((client) => client.id)
  );

  const rows = clients.map((client) =>
    mapClientToRow(
      client,
      duplicateClientIds,
      latestActivities.get(client.id)
    )
  );

  const filteredRows = applyPostFilters(rows, filters);
  sortRows(filteredRows);

  const offset = Math.max(filters.offset ?? 0, 0);
  const limit = filters.limit;

  if (limit === undefined || limit <= 0) {
    return filteredRows.slice(offset);
  }

  return filteredRows.slice(offset, offset + limit);
}

const SEARCH_CANDIDATE_LIMIT = 100;

export type ClientSearchResult = {
  clientId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  sourceLabels: string[];
  attentionScore: number;
  attentionReasons: string[];
};

function mapRowToSearchResult(row: LeadCommandCenterRow): ClientSearchResult {
  return {
    clientId: row.clientId,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    status: row.status,
    sourceLabels: row.sourceLabels,
    attentionScore: row.attentionScore,
    attentionReasons: row.attentionReasons,
  };
}

export async function searchClients(options: {
  query: string;
  assignedUserId?: string;
  limit?: number;
}): Promise<ClientSearchResult[]> {
  const query = options.query.trim();
  if (!query) {
    return [];
  }

  const limit = Math.min(Math.max(options.limit ?? 10, 1), 10);
  const where = buildClientWhere({
    search: query,
    assignedUserId: options.assignedUserId,
  });

  const [clients, duplicateClientIds] = await Promise.all([
    prisma.client.findMany({
      where,
      take: SEARCH_CANDIDATE_LIMIT,
      orderBy: { lastModified: 'desc' },
      include: {
        clientAssignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        sourceRecords: {
          orderBy: { receivedAt: 'desc' },
          select: {
            source: true,
            externalId: true,
            receivedAt: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    }),
    loadDuplicateClientIds(),
  ]);

  if (clients.length === 0) {
    return [];
  }

  const latestActivities = await loadLatestActivitiesByClientId(
    clients.map((client) => client.id)
  );

  const rows = clients.map((client) =>
    mapClientToRow(
      client,
      duplicateClientIds,
      latestActivities.get(client.id)
    )
  );

  sortRows(rows);

  return rows.slice(0, limit).map(mapRowToSearchResult);
}
