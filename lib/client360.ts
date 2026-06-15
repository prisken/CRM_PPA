import type {
  ActivityLogType,
  Client,
  Deal,
  Prisma,
  Strategy,
  User,
} from '@prisma/client';

type ClientWithRelations = Client360Record;

type ActivityLogEntry = {
  id: string;
  type: ActivityLogType | string;
  content: string;
  date: string;
  source: 'manual' | 'system';
  userName: string | null;
};

function formatUserName(user: Pick<User, 'name' | 'email'> | null | undefined) {
  if (!user) {
    return null;
  }

  return user.name ?? user.email;
}

function resolveDealValue(
  clientDealValue: Client['dealValue'],
  deals: Pick<Deal, 'dealValue'>[]
) {
  if (clientDealValue !== null && clientDealValue !== undefined) {
    return Number(clientDealValue);
  }

  return deals.reduce((total, deal) => total + Number(deal.dealValue), 0);
}

function resolveGrossProfit(deals: Pick<Deal, 'grossProfit'>[]) {
  if (deals.length === 0) {
    return 0;
  }

  return Number(deals[0].grossProfit);
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

function buildActivityLog(client: ClientWithRelations): ActivityLogEntry[] {
  const manualEntries: ActivityLogEntry[] = client.interactions.map((interaction) => ({
    id: interaction.id,
    type: interaction.type,
    content: interaction.content,
    date: interaction.date.toISOString(),
    source: 'manual',
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

  return [...manualEntries, ...systemEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
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
    deal_value: resolveDealValue(client.dealValue, client.deals),
    gross_profit: resolveGrossProfit(client.deals),
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
    deals: client.deals.map((deal) => ({
      id: deal.id,
      name: deal.name,
      dealValue: Number(deal.dealValue),
      grossProfit: Number(deal.grossProfit),
      status: deal.status,
    })),
    interactions: client.interactions.map((interaction) => ({
      id: interaction.id,
      type: interaction.type,
      content: interaction.content,
      date: interaction.date.toISOString(),
      userName: formatUserName(interaction.user),
    })),
  };
}

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
      grossProfit: true,
      status: true,
    },
  },
} satisfies Prisma.ClientInclude;

type Client360Record = Prisma.ClientGetPayload<{ include: typeof client360Include }>;
