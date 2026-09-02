import {
  Prisma,
  type ActivityLogType,
  type Client,
  type Strategy,
  type User,
} from '@prisma/client';
import {
  calculateCommittedValue,
  calculatePotentialValue,
  dealResponseSelect,
  formatDealResponse,
  type DealListItem,
} from '@/lib/dealCalculations';
import { listClientDealsForClient360 } from '@/lib/clientDeals';
import {
  resolveImportantDatesForClient,
  importantDateRecordSelect,
  type ImportantDateRecordLike,
} from '@/lib/importantDates';
import {
  clientContactSelect,
  resolveContactsFromRecords,
  type ClientContactRecordLike,
} from '@/lib/clientContacts';
import { prisma } from '@/lib/prisma';
import { timeAsync } from '@/lib/performance';

const CLIENT360_ACTIVITY_LOG_LIMIT = 300;
const CLIENT360_ACTIVITY_SOURCE_LIMIT = 300;

type ClientWithRelations = Client360Record;

type ActivityLogEntry = {
  id: string;
  type: ActivityLogType | string;
  content: string;
  date: string;
  source: 'manual' | 'system';
  userId?: string | null;
  userName: string | null;
};

function formatUserName(user: Pick<User, 'name' | 'email'> | null | undefined) {
  if (!user) {
    return null;
  }

  return user.name ?? user.email;
}

function resolveStrategyText(
  strategyText: Client['strategyText'],
  strategies: Pick<Strategy, 'description' | 'updatedAt'>[]
) {
  if (strategyText?.trim()) {
    return strategyText;
  }

  if (strategies.length === 0) {
    return '';
  }

  const latestStrategy = [...strategies].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  )[0];

  return latestStrategy.description;
}

function resolveClientImportantDates(client: {
  importantDates: Client['importantDates'];
  importantDateRecords?: ImportantDateRecordLike[] | null;
}) {
  return resolveImportantDatesForClient({
    records: client.importantDateRecords,
    legacyJson: client.importantDates,
  });
}

function resolveClientContacts(client: {
  email: string | null;
  phone: string | null;
  contacts?: ClientContactRecordLike[] | null;
}) {
  return resolveContactsFromRecords(
    client.contacts,
    client.email,
    client.phone
  );
}

function buildActivityLog(client: {
  interactions: {
    id: string;
    type: ActivityLogType | string;
    content: string;
    date: Date;
    userId: string;
    user: Pick<User, 'name' | 'email'>;
  }[];
  activityLogs: {
    id: string;
    type: ActivityLogType | string;
    content: string;
    createdAt: Date;
    user: Pick<User, 'name' | 'email'> | null;
  }[];
}): ActivityLogEntry[] {
  const manualEntries: ActivityLogEntry[] = client.interactions.map((interaction) => ({
    id: interaction.id,
    type: interaction.type,
    content: interaction.content,
    date: interaction.date.toISOString(),
    source: 'manual',
    userId: interaction.userId,
    userName: formatUserName(interaction.user),
  }));

  const systemEntries: ActivityLogEntry[] = client.activityLogs.map((entry) => ({
    id: entry.id,
    type: entry.type,
    content: entry.content,
    date: entry.createdAt.toISOString(),
    source: 'system',
    userName: formatUserName(entry.user),
  }));

  return [...manualEntries, ...systemEntries]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, CLIENT360_ACTIVITY_LOG_LIMIT);
}

export function buildClient360CoreResponse(
  client: Client360CoreRecord | Client360PageCoreRecord
) {
  const assignedUsers = client.clientAssignments.map((assignment) => ({
    assignment_id: assignment.assignmentId,
    user_id: assignment.user.id,
    name: assignment.user.name ?? assignment.user.email,
    role: assignment.role,
  }));

  const documents =
    'documents' in client && Array.isArray(client.documents)
      ? client.documents.map((document) => ({
          id: document.id,
          fileName: document.fileName,
          downloadUrl: document.url,
          uploadedAt: document.uploadedAt.toISOString(),
        }))
      : [];

  const strategies =
    'strategies' in client && Array.isArray(client.strategies)
      ? client.strategies
      : [];

  const contacts = resolveClientContacts(client);

  return {
    client_id: client.id,
    name: client.name,
    company: client.company,
    contactInfo: client.contactInfo,
    email: contacts.email,
    phone: contacts.phone,
    emails: contacts.emails,
    phones: contacts.phones,
    lead_source: client.leadSource,
    roleInCompany: client.roleInCompany,
    employeeCount: client.employeeCount,
    expectations: client.expectations,
    importantDates: resolveClientImportantDates(client),
    equity: client.equity !== null && client.equity !== undefined ? Number(client.equity) : 0,
    status: client.status,
    pendingNotifications: client.pendingNotifications,
    priority: client.priority ?? null,
    nextAction: client.nextAction ?? null,
    nextFollowUpAt: client.nextFollowUpAt
      ? client.nextFollowUpAt.toISOString()
      : null,
    createdAt: client.createdAt.toISOString(),
    lastModified: client.lastModified.toISOString(),
    assignedUsers,
    documents,
    strategyText: resolveStrategyText(client.strategyText, strategies),
    assignments: client.clientAssignments.map((assignment) => ({
      assignment_id: assignment.assignmentId,
      user_id: assignment.user.id,
      userName: assignment.user.name ?? assignment.user.email,
      role: assignment.role,
    })),
  };
}

function mapTasks(
  client: {
    tasks: {
      id: string;
      title: string;
      description: string | null;
      status: string;
      dueDate: Date | null;
      createdAt: Date;
      updatedAt: Date;
      assignee: Pick<User, 'id' | 'name' | 'email'> | null;
    }[];
  }
) {
  return client.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate?.toISOString() ?? null,
    assignee: task.assignee
      ? {
          user_id: task.assignee.id,
          name: task.assignee.name ?? task.assignee.email,
        }
      : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }));
}

export function buildStrategyTasksWorkspace(
  client: Prisma.ClientGetPayload<{ select: typeof client360StrategyTasksSelect }>
) {
  return {
    tab: 'strategy-tasks' as const,
    strategyText: resolveStrategyText(client.strategyText, client.strategies),
    tasks: mapTasks(client),
  };
}

/** True when Client.strategyText is blank and legacy Strategy take-1 may apply. */
export function shouldFetchLegacyStrategyFallback(
  strategyText: string | null | undefined
): boolean {
  return !(strategyText ?? '').trim();
}

const strategyTasksTaskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.TaskSelect;

/**
 * Phase 3D — load workspace strategy-tasks without Prisma nested sequential RTTs.
 *
 * Nested `client360StrategyTasksSelect` issues Client → Strategy → Tasks as
 * sequential pooler round-trips (~3). This loader runs Client scalar + Tasks +
 * legacy Strategy take-1 in **parallel** (one pooler wall RTT).
 *
 * Measured (empty sample): nested ~400 ms · hybrid (skip legacy after scalar)
 * ~520–560 ms (two RTTs) · parallel-all **~260–300 ms**.
 *
 * Semantic short-circuit remains in {@link resolveStrategyText}: non-blank
 * `strategyText` ignores Strategy rows. We still fetch Strategy in parallel so
 * the empty first-paint path does not pay a second sequential RTT.
 *
 * Response shape matches {@link buildStrategyTasksWorkspace}. Domain stays on pooler.
 */
export async function loadStrategyTasksWorkspace(clientId: string) {
  return timeAsync(
    'client360:workspace:strategyTasks:domain',
    async () => {
      const [clientRow, tasks, strategies] = await timeAsync(
        'client360:workspace:strategyTasks:parallelBase',
        () =>
          Promise.all([
            timeAsync(
              'client360:workspace:strategyTasks:clientScalar',
              () =>
                prisma.client.findUnique({
                  where: { id: clientId },
                  select: { id: true, strategyText: true },
                }),
              {
                getMeta: (row) => ({
                  transport: 'pooler',
                  found: row !== null,
                  strategyChars: (row?.strategyText ?? '').trim().length,
                }),
              }
            ),
            timeAsync(
              'client360:workspace:strategyTasks:tasks',
              () =>
                prisma.task.findMany({
                  where: { clientId },
                  orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
                  select: strategyTasksTaskSelect,
                }),
              {
                getMeta: (rows) => ({
                  transport: 'pooler',
                  taskCount: rows.length,
                }),
              }
            ),
            timeAsync(
              'client360:workspace:strategyTasks:legacyStrategy',
              () =>
                prisma.strategy.findMany({
                  where: { clientId },
                  orderBy: { updatedAt: 'desc' },
                  take: 1,
                  select: { description: true, updatedAt: true },
                }),
              {
                getMeta: (rows) => ({
                  transport: 'pooler',
                  strategyCount: rows.length,
                }),
              }
            ),
          ]),
        {
          getMeta: ([row, taskRows, strategyRows]) => ({
            transport: 'pooler',
            found: row !== null,
            taskCount: taskRows.length,
            strategyCount: strategyRows.length,
            wouldUseLegacy: row
              ? shouldFetchLegacyStrategyFallback(row.strategyText)
              : false,
          }),
        }
      );

      if (!clientRow) {
        return null;
      }

      // Semantic short-circuit: ignore Strategy rows when strategyText is set.
      const strategiesForResolve = shouldFetchLegacyStrategyFallback(
        clientRow.strategyText
      )
        ? strategies
        : [];

      return timeAsync(
        'client360:workspace:strategyTasks:map',
        async () =>
          buildStrategyTasksWorkspace({
            strategyText: clientRow.strategyText,
            strategies: strategiesForResolve,
            tasks,
          }),
        (result) => ({
          taskCount: result.tasks.length,
          strategyChars: result.strategyText.length,
          legacyApplied: strategiesForResolve.length > 0,
        })
      );
    },
    (result) => ({
      transport: 'pooler',
      found: result !== null,
      taskCount: result?.tasks.length ?? 0,
      strategyChars: result?.strategyText.length ?? 0,
    })
  );
}

export function buildActivityNotesWorkspace(
  client: Prisma.ClientGetPayload<{ select: typeof client360ActivitySelect }>
) {
  return {
    tab: 'activity-notes' as const,
    activityLog: buildActivityLog(client),
  };
}

export function buildClient360WorkspaceResponse(
  client: Client360WorkspaceRecord,
  tab: string
) {
  if (tab === 'strategy-tasks') {
    return buildStrategyTasksWorkspace(client);
  }

  if (tab === 'activity' || tab === 'activity-notes') {
    return buildActivityNotesWorkspace(client);
  }

  return null;
}

export function buildClient360Response(client: ClientWithRelations) {
  const assignedUsers = client.clientAssignments.map((assignment) => ({
    assignment_id: assignment.assignmentId,
    user_id: assignment.user.id,
    name: assignment.user.name ?? assignment.user.email,
    role: assignment.role,
  }));

  const documents = client.documents.map((document) => ({
    id: document.id,
    fileName: document.fileName,
    downloadUrl: document.url,
    uploadedAt: document.uploadedAt.toISOString(),
  }));

  const tasks = client.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate?.toISOString() ?? null,
    assignee: task.assignee
      ? {
          user_id: task.assignee.id,
          name: task.assignee.name ?? task.assignee.email,
        }
      : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }));

  const activityLog = buildActivityLog(client);
  const deals = client.deals.map(formatDealResponse);
  const contacts = resolveClientContacts(client);

  return {
    client_id: client.id,
    name: client.name,
    company: client.company,
    contactInfo: client.contactInfo,
    email: contacts.email,
    phone: contacts.phone,
    emails: contacts.emails,
    phones: contacts.phones,
    lead_source: client.leadSource,
    roleInCompany: client.roleInCompany,
    employeeCount: client.employeeCount,
    expectations: client.expectations,
    importantDates: resolveClientImportantDates(client),
    committedValue: calculateCommittedValue(client.deals),
    potentialValue: calculatePotentialValue(client.deals),
    equity: client.equity !== null && client.equity !== undefined ? Number(client.equity) : 0,
    status: client.status,
    pendingNotifications: client.pendingNotifications,
    createdAt: client.createdAt.toISOString(),
    lastModified: client.lastModified.toISOString(),
    assignedUsers,
    documents,
    strategyText: resolveStrategyText(client.strategyText, client.strategies),
    tasks,
    activityLog,
    assignments: client.clientAssignments.map((assignment) => ({
      assignment_id: assignment.assignmentId,
      user_id: assignment.user.id,
      userName: assignment.user.name ?? assignment.user.email,
      role: assignment.role,
    })),
    deals,
    interactions: client.interactions.map((interaction) => ({
      id: interaction.id,
      type: interaction.type,
      content: interaction.content,
      date: interaction.date.toISOString(),
      userName: formatUserName(interaction.user),
    })),
  };
}

const client360AssignmentSelect = {
  assignmentId: true,
  role: true,
  user: {
    select: { id: true, name: true, email: true },
  },
} as const;

const client360DocumentSelect = {
  id: true,
  fileName: true,
  url: true,
  uploadedAt: true,
} as const;

const client360StrategySelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  updatedAt: true,
} as const;

/** Scalars required by buildClient360CoreResponse / buildClient360Response. */
const client360CoreScalarSelect = {
  id: true,
  name: true,
  company: true,
  contactInfo: true,
  email: true,
  phone: true,
  leadSource: true,
  roleInCompany: true,
  employeeCount: true,
  expectations: true,
  importantDates: true,
  equity: true,
  status: true,
  pendingNotifications: true,
  priority: true,
  nextAction: true,
  nextFollowUpAt: true,
  createdAt: true,
  lastModified: true,
  strategyText: true,
} as const;

/**
 * Narrow select for Client 360 core GET / RSC / core-slice refresh.
 * Intentionally omits `documents` and `strategies` joins — DTO still returns
 * `documents: []` and `strategyText` from `Client.strategyText` (workspace tab
 * loads strategy/tasks separately). Assignments only need id/role + user
 * id/name/email for team + stage permissions.
 */
export const client360CoreQuerySelect = {
  ...client360CoreScalarSelect,
  clientAssignments: { select: client360AssignmentSelect },
  importantDateRecords: {
    orderBy: { scheduledAt: 'asc' as const },
    select: importantDateRecordSelect,
  },
  contacts: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    select: {
      kind: true,
      value: true,
      isPrimary: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.ClientSelect;

/**
 * Fuller core select (includes documents + legacy strategies) for callers that
 * still need those relations on the same DTO shape (e.g. archive refresh).
 */
export const client360CoreSelect = {
  ...client360CoreScalarSelect,
  clientAssignments: { select: client360AssignmentSelect },
  importantDateRecords: {
    orderBy: { scheduledAt: 'asc' as const },
    select: importantDateRecordSelect,
  },
  contacts: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    select: clientContactSelect,
  },
  documents: {
    orderBy: { uploadedAt: 'desc' as const },
    select: client360DocumentSelect,
  },
  strategies: {
    select: client360StrategySelect,
    orderBy: { updatedAt: 'desc' as const },
  },
} satisfies Prisma.ClientSelect;

/** RSC page load uses the same narrow core query as GET /api/clients/[id]. */
export const client360PageCoreSelect = client360CoreQuerySelect;

/** @deprecated Prefer client360CoreSelect. Kept for callers still using include. */
export const client360CoreInclude = {
  clientAssignments: client360CoreSelect.clientAssignments,
  importantDateRecords: client360CoreSelect.importantDateRecords,
  contacts: client360CoreSelect.contacts,
  documents: client360CoreSelect.documents,
  strategies: client360CoreSelect.strategies,
} satisfies Prisma.ClientInclude;

/** @deprecated Prefer client360PageCoreSelect / client360CoreQuerySelect. */
export const client360PageCoreInclude = {
  clientAssignments: client360CoreQuerySelect.clientAssignments,
  importantDateRecords: client360CoreQuerySelect.importantDateRecords,
  contacts: client360CoreQuerySelect.contacts,
} satisfies Prisma.ClientInclude;

export const client360StrategyTasksSelect = {
  strategyText: true,
  strategies: {
    select: {
      description: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' as const },
    take: 1,
  },
  tasks: {
    orderBy: [{ status: 'asc' as const }, { dueDate: 'asc' as const }],
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      assignee: {
        select: { id: true, name: true, email: true },
      },
    },
  },
} satisfies Prisma.ClientSelect;

/** @deprecated Prefer client360StrategyTasksSelect. */
export const client360StrategyTasksInclude = {
  strategies: client360StrategyTasksSelect.strategies,
  tasks: client360StrategyTasksSelect.tasks,
} satisfies Prisma.ClientInclude;

export const client360ActivitySelect = {
  interactions: {
    orderBy: { date: 'desc' as const },
    take: CLIENT360_ACTIVITY_SOURCE_LIMIT,
    select: {
      id: true,
      type: true,
      content: true,
      date: true,
      userId: true,
      user: {
        select: { name: true, email: true },
      },
    },
  },
  activityLogs: {
    orderBy: { createdAt: 'desc' as const },
    take: CLIENT360_ACTIVITY_SOURCE_LIMIT,
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      user: {
        select: { name: true, email: true },
      },
    },
  },
} satisfies Prisma.ClientSelect;

/** @deprecated Prefer client360ActivitySelect. */
export const client360ActivityInclude = {
  interactions: client360ActivitySelect.interactions,
  activityLogs: client360ActivitySelect.activityLogs,
} satisfies Prisma.ClientInclude;

export const client360Include = {
  clientAssignments: {
    select: client360AssignmentSelect,
  },
  importantDateRecords: {
    orderBy: { scheduledAt: 'asc' as const },
    select: importantDateRecordSelect,
  },
  contacts: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    select: clientContactSelect,
  },
  documents: {
    orderBy: { uploadedAt: 'desc' as const },
    select: client360DocumentSelect,
  },
  strategies: {
    select: client360StrategySelect,
    orderBy: { updatedAt: 'desc' as const },
  },
  tasks: {
    orderBy: [{ status: 'asc' as const }, { dueDate: 'asc' as const }],
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      assignee: {
        select: { id: true, name: true, email: true },
      },
    },
  },
  interactions: {
    orderBy: { date: 'desc' as const },
    select: {
      id: true,
      type: true,
      content: true,
      date: true,
      userId: true,
      user: {
        select: { name: true, email: true },
      },
    },
  },
  activityLogs: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      user: {
        select: { name: true, email: true },
      },
    },
  },
  deals: {
    orderBy: { createdAt: 'asc' as const },
    select: dealResponseSelect,
  },
} satisfies Prisma.ClientInclude;

type Client360Record = Prisma.ClientGetPayload<{ include: typeof client360Include }>;
type Client360CoreRecord = Prisma.ClientGetPayload<{ select: typeof client360CoreSelect }>;
type Client360PageCoreRecord = Prisma.ClientGetPayload<{
  select: typeof client360CoreQuerySelect;
}>;
type Client360WorkspaceRecord = Prisma.ClientGetPayload<{
  select: typeof client360StrategyTasksSelect & typeof client360ActivitySelect;
}>;

export function getClient360WorkspaceSelect(tab: string): Prisma.ClientSelect {
  if (tab === 'strategy-tasks') {
    return client360StrategyTasksSelect;
  }

  if (tab === 'activity' || tab === 'activity-notes') {
    return client360ActivitySelect;
  }

  return {};
}

/** @deprecated Prefer getClient360WorkspaceSelect. */
export function getClient360WorkspaceInclude(tab: string): Prisma.ClientInclude {
  if (tab === 'strategy-tasks') {
    return client360StrategyTasksInclude;
  }

  if (tab === 'activity' || tab === 'activity-notes') {
    return client360ActivityInclude;
  }

  return {};
}

export type Client360CoreData = ReturnType<typeof buildClient360CoreResponse>;

export type Client360DealData = DealListItem;

export type Client360CompanyHierarchyData = {
  company: string | null;
  employeeCount: number | null;
  colleagues: {
    client_id: string;
    name: string;
    roleInCompany: string | null;
    status: string;
  }[];
  /** Total same-company colleagues (may exceed `colleagues.length` when capped). */
  colleagueCount: number;
  colleaguesHasMore: boolean;
};

/** Cap colleagues returned on Client 360 hierarchy (newest-name order still name asc). */
export const CLIENT360_HIERARCHY_COLLEAGUES_LIMIT = 50;

export async function getClient360CoreData(
  clientId: string
): Promise<Client360CoreData | null> {
  return timeAsync(
    'client360:getClient360CoreData',
    async () => {
      const client = await timeAsync('client360:core:query', () =>
        prisma.client.findUnique({
          where: { id: clientId },
          select: client360CoreQuerySelect,
        })
      );

      if (!client) {
        return null;
      }

      return timeAsync('client360:core:map', async () =>
        buildClient360CoreResponse(client)
      );
    },
    {
      payloadCategory: 'client360-core',
      getMeta: (result) => ({
        clientId,
        found: result !== null,
      }),
    }
  );
}

export async function getClient360DealsData(
  clientId: string
): Promise<Client360DealData[]> {
  return timeAsync(
    'client360:getClient360DealsData',
    async () => listClientDealsForClient360(clientId),
    {
      payloadCategory: 'deals',
      getMeta: (result) => ({
        clientId,
        dealCount: result.length,
      }),
    }
  );
}

export type Client360CompanyHierarchyPreload = {
  company: string | null;
  employeeCount: number | null;
};

/** API/RSC hierarchy payload including target `client_id` (response contract). */
export type Client360CompanyHierarchyPayload = Client360CompanyHierarchyData & {
  client_id: string;
};

type HierarchyCombinedRow = {
  target_id: string;
  target_company: string | null;
  target_employee_count: number | null;
  colleague_id: string | null;
  colleague_name: string | null;
  colleague_role_in_company: string | null;
  colleague_status: string | null;
  colleague_total: number;
};

/**
 * One round-trip: target client company fields + capped colleagues + total count.
 * Replaces the old clientLookup → findMany/count sequence (Phase 2F).
 */
async function fetchCompanyHierarchyCombined(
  clientId: string
): Promise<HierarchyCombinedRow[] | null> {
  const limit = CLIENT360_HIERARCHY_COLLEAGUES_LIMIT;
  const rows = await prisma.$queryRaw<HierarchyCombinedRow[]>(Prisma.sql`
    WITH target AS (
      SELECT id, company, employee_count
      FROM "Client"
      WHERE id = ${clientId}
    ),
    scoped AS (
      SELECT c.id, c.name, c.role_in_company, c.status::text AS status
      FROM "Client" c
      INNER JOIN target t
        ON t.company IS NOT NULL
        AND BTRIM(t.company) <> ''
        AND c.company = t.company
        AND c.id <> t.id
    ),
    counted AS (
      SELECT COUNT(*)::int AS total FROM scoped
    ),
    limited AS (
      SELECT id, name, role_in_company, status
      FROM scoped
      ORDER BY name ASC
      LIMIT ${limit}
    )
    SELECT
      t.id AS target_id,
      t.company AS target_company,
      t.employee_count AS target_employee_count,
      l.id AS colleague_id,
      l.name AS colleague_name,
      l.role_in_company AS colleague_role_in_company,
      l.status AS colleague_status,
      c.total AS colleague_total
    FROM target t
    CROSS JOIN counted c
    LEFT JOIN limited l ON TRUE
  `);

  return rows.length > 0 ? rows : null;
}

function mapHierarchyCombinedRows(
  rows: HierarchyCombinedRow[]
): Client360CompanyHierarchyPayload {
  const first = rows[0];
  const colleagues = rows
    .filter((row) => row.colleague_id != null)
    .map((row) => ({
      client_id: row.colleague_id as string,
      name: row.colleague_name as string,
      roleInCompany: row.colleague_role_in_company,
      status: row.colleague_status as string,
    }));
  const colleagueCount = Number(first.colleague_total);

  return {
    client_id: first.target_id,
    company: first.target_company,
    employeeCount: first.target_employee_count,
    colleagues,
    colleagueCount,
    colleaguesHasMore: colleagueCount > colleagues.length,
  };
}

/**
 * GET /employees loader: single combined query (no separate clientLookup).
 */
export async function loadCompanyHierarchyApiPayload(
  clientId: string
): Promise<Client360CompanyHierarchyPayload | null> {
  const rows = await timeAsync('client360:hierarchy:query', () =>
    fetchCompanyHierarchyCombined(clientId)
  );
  if (!rows) {
    return null;
  }

  return timeAsync('client360:hierarchy:map', async () =>
    mapHierarchyCombinedRows(rows)
  );
}

export async function getClient360CompanyHierarchyData(
  clientId: string,
  preload?: Client360CompanyHierarchyPreload
): Promise<Client360CompanyHierarchyData | null> {
  return timeAsync(
    'client360:getClient360CompanyHierarchyData',
    async () => {
      // RSC already has company/employeeCount from core — reuse to skip target Client read.
      if (preload) {
        return listCompanyHierarchyColleagues(
          clientId,
          preload.company,
          preload.employeeCount
        );
      }

      const payload = await loadCompanyHierarchyApiPayload(clientId);
      if (!payload) {
        return null;
      }

      const { client_id: _omitClientId, ...hierarchy } = payload;
      void _omitClientId;
      return hierarchy;
    },
    (result) => ({
      clientId,
      found: result !== null,
      colleagueCount: result?.colleagueCount ?? 0,
      colleaguesReturned: result?.colleagues.length ?? 0,
      colleaguesHasMore: result?.colleaguesHasMore ?? false,
      colleaguesLimit: CLIENT360_HIERARCHY_COLLEAGUES_LIMIT,
    })
  );
}

/**
 * Shared hierarchy list when company/employeeCount are already known (RSC preload).
 * Colleague findMany + count only — no target clientLookup.
 */
export async function listCompanyHierarchyColleagues(
  clientId: string,
  company: string | null,
  employeeCount: number | null
): Promise<Client360CompanyHierarchyData> {
  const trimmedCompany = company?.trim() ?? null;
  if (!trimmedCompany) {
    return {
      company,
      employeeCount,
      colleagues: [],
      colleagueCount: 0,
      colleaguesHasMore: false,
    };
  }

  const where = {
    company: trimmedCompany,
    id: { not: clientId },
  };

  const [colleagues, colleagueCount] = await timeAsync(
    'client360:hierarchy:query',
    () =>
      Promise.all([
        prisma.client.findMany({
          where,
          select: {
            id: true,
            name: true,
            roleInCompany: true,
            status: true,
          },
          orderBy: { name: 'asc' },
          take: CLIENT360_HIERARCHY_COLLEAGUES_LIMIT,
        }),
        prisma.client.count({ where }),
      ])
  );

  return timeAsync('client360:hierarchy:map', async () => ({
    company,
    employeeCount,
    colleagues: colleagues.map((colleague) => ({
      client_id: colleague.id,
      name: colleague.name,
      roleInCompany: colleague.roleInCompany,
      status: colleague.status,
    })),
    colleagueCount,
    colleaguesHasMore: colleagueCount > colleagues.length,
  }));
}

export type LoadClient360PageDataOptions = {
  includeDeals?: boolean;
};

export async function loadClient360PageData(
  clientId: string,
  options: LoadClient360PageDataOptions = {}
) {
  const includeDeals = options.includeDeals !== false;

  return timeAsync(
    'client360:loadClient360PageData',
    async () => {
      const core = await getClient360CoreData(clientId);
      if (!core) {
        return { core: null, deals: [], hierarchy: null };
      }

      const [deals, hierarchy] = await Promise.all([
        includeDeals ? getClient360DealsData(clientId) : Promise.resolve([]),
        getClient360CompanyHierarchyData(clientId, {
          company: core.company,
          employeeCount: core.employeeCount,
        }),
      ]);

      return { core, deals, hierarchy };
    },
    (result) => ({
      clientId,
      hasCore: result.core !== null,
      dealCount: result.deals.length,
      hasHierarchy: result.hierarchy !== null,
    })
  );
}
