import type {
  ActivityLogType,
  Client,
  Prisma,
  Strategy,
  User,
} from '@prisma/client';
import {
  calculateCommittedValue,
  calculatePotentialValue,
  formatDealResponse,
} from '@/lib/dealCalculations';
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

function normalizeImportantDates(value: Client['importantDates']) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is { label: string; date: string } => {
      return (
        typeof entry === 'object' &&
        entry !== null &&
        'label' in entry &&
        'date' in entry
      );
    })
    .map((entry) => ({
      label: String(entry.label ?? ''),
      date: String(entry.date ?? ''),
    }));
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

  return {
    client_id: client.id,
    name: client.name,
    company: client.company,
    contactInfo: client.contactInfo,
    email: client.email,
    phone: client.phone,
    lead_source: client.leadSource,
    roleInCompany: client.roleInCompany,
    employeeCount: client.employeeCount,
    expectations: client.expectations,
    importantDates: normalizeImportantDates(client.importantDates),
    equity: client.equity !== null && client.equity !== undefined ? Number(client.equity) : 0,
    status: client.status,
    pendingNotifications: client.pendingNotifications,
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
  client: Prisma.ClientGetPayload<{ include: typeof client360StrategyTasksInclude }>
) {
  return {
    tab: 'strategy-tasks' as const,
    strategyText: resolveStrategyText(client.strategyText, client.strategies),
    tasks: mapTasks(client),
  };
}

export function buildActivityNotesWorkspace(
  client: Prisma.ClientGetPayload<{ include: typeof client360ActivityInclude }>
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
  const deals = client.deals.map((deal) => ({
    id: deal.id,
    name: deal.name,
    dealValue: Number(deal.dealValue),
    totalCommission: Number(deal.totalCommission),
    status: deal.status,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  }));

  return {
    client_id: client.id,
    name: client.name,
    company: client.company,
    contactInfo: client.contactInfo,
    email: client.email,
    phone: client.phone,
    lead_source: client.leadSource,
    roleInCompany: client.roleInCompany,
    employeeCount: client.employeeCount,
    expectations: client.expectations,
    importantDates: normalizeImportantDates(client.importantDates),
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

export const client360CoreInclude = {
  clientAssignments: {
    select: {
      assignmentId: true,
      role: true,
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  },
  documents: {
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      fileName: true,
      url: true,
      uploadedAt: true,
    },
  },
  strategies: {
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  },
} satisfies Prisma.ClientInclude;

/** Lighter include for Client 360 server page load (no documents/strategies). */
export const client360PageCoreInclude = {
  clientAssignments: client360CoreInclude.clientAssignments,
} satisfies Prisma.ClientInclude;

export const client360StrategyTasksInclude = {
  strategies: {
    select: {
      description: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 1,
  },
  tasks: {
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
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
} satisfies Prisma.ClientInclude;

export const client360ActivityInclude = {
  interactions: {
    orderBy: { date: 'desc' },
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
    orderBy: { createdAt: 'desc' },
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
} satisfies Prisma.ClientInclude;

export const client360Include = {
  clientAssignments: {
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  },
  documents: {
    orderBy: { uploadedAt: 'desc' },
  },
  strategies: {
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  },
  tasks: {
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    include: {
      assignee: {
        select: { id: true, name: true, email: true },
      },
    },
  },
  interactions: {
    orderBy: { date: 'desc' },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  },
  activityLogs: {
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  },
  deals: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      dealValue: true,
      totalCommission: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.ClientInclude;

type Client360Record = Prisma.ClientGetPayload<{ include: typeof client360Include }>;
type Client360CoreRecord = Prisma.ClientGetPayload<{ include: typeof client360CoreInclude }>;
type Client360PageCoreRecord = Prisma.ClientGetPayload<{
  include: typeof client360PageCoreInclude;
}>;
type Client360WorkspaceRecord = Prisma.ClientGetPayload<{
  include: typeof client360StrategyTasksInclude & typeof client360ActivityInclude;
}>;

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

export type Client360DealData = ReturnType<typeof formatDealResponse>;

export type Client360CompanyHierarchyData = {
  company: string | null;
  employeeCount: number | null;
  colleagues: {
    client_id: string;
    name: string;
    roleInCompany: string | null;
    status: string;
  }[];
};

export async function getClient360CoreData(
  clientId: string
): Promise<Client360CoreData | null> {
  return timeAsync(
    'client360:getClient360CoreData',
    async () => {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: client360PageCoreInclude,
      });

      if (!client) {
        return null;
      }

      return buildClient360CoreResponse(client);
    },
    (result) => ({
      clientId,
      found: result !== null,
    })
  );
}

export async function getClient360DealsData(
  clientId: string
): Promise<Client360DealData[]> {
  return timeAsync(
    'client360:getClient360DealsData',
    async () => {
      const deals = await prisma.deal.findMany({
        where: { clientId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          dealValue: true,
          totalCommission: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return deals.map(formatDealResponse);
    },
    (result) => ({
      clientId,
      dealCount: result.length,
    })
  );
}

export type Client360CompanyHierarchyPreload = {
  company: string | null;
  employeeCount: number | null;
};

export async function getClient360CompanyHierarchyData(
  clientId: string,
  preload?: Client360CompanyHierarchyPreload
): Promise<Client360CompanyHierarchyData | null> {
  return timeAsync(
    'client360:getClient360CompanyHierarchyData',
    async () => {
      let company: string | null;
      let employeeCount: number | null;

      if (preload) {
        company = preload.company;
        employeeCount = preload.employeeCount;
      } else {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: {
            id: true,
            company: true,
            employeeCount: true,
          },
        });

        if (!client) {
          return null;
        }

        company = client.company;
        employeeCount = client.employeeCount;
      }

      const colleagues = company?.trim()
        ? await prisma.client.findMany({
            where: {
              company,
              id: { not: clientId },
            },
            select: {
              id: true,
              name: true,
              roleInCompany: true,
              status: true,
            },
            orderBy: { name: 'asc' },
          })
        : [];

      return {
        company,
        employeeCount,
        colleagues: colleagues.map((colleague) => ({
          client_id: colleague.id,
          name: colleague.name,
          roleInCompany: colleague.roleInCompany,
          status: colleague.status,
        })),
      };
    },
    (result) => ({
      clientId,
      found: result !== null,
      colleagueCount: result?.colleagues.length ?? 0,
    })
  );
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
