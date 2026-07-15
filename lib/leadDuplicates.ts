import { ClientStatus, LeadSourceType, Prisma } from '@prisma/client';
import {
  compactString,
  normalizeEmail,
  normalizePhone,
} from '@/lib/leadNormalization';
import { prisma } from '@/lib/prisma';

const DEFAULT_GROUP_LIMIT = 100;

const LEAD_SOURCE_LABELS: Record<LeadSourceType, string> = {
  [LeadSourceType.GOOGLE_FORMS]: 'Google Forms',
  [LeadSourceType.PROFIT_PULSE_ALLY]: 'Profit Pulse Ally',
  [LeadSourceType.MANUAL]: 'Manual',
  [LeadSourceType.OTHER]: 'Other',
};

export type DuplicateReviewAssignedUser = {
  assignmentId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
};

export type DuplicateReviewClient = {
  clientId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  leadSource: string | null;
  roleInCompany: string | null;
  employeeCount: number | null;
  expectations: string | null;
  contactInfo: string | null;
  status: string;
  createdAt: string;
  lastModified: string;
  sourceLabels: string[];
  assignedUsers: DuplicateReviewAssignedUser[];
  activityCount: number;
  dealCount: number;
  priority?: string | null;
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
};

export type DuplicateReviewGroup = {
  type: 'email' | 'phone';
  key: string;
  clients: DuplicateReviewClient[];
};

export type FetchLeadDuplicateGroupsOptions = {
  includeArchived?: boolean;
  limit?: number;
};

type ClientIndexRow = {
  id: string;
  email: string | null;
  phone: string | null;
};

type ClientDetailRow = Prisma.ClientGetPayload<{
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
      };
    };
    _count: {
      select: {
        interactions: true;
        activityLogs: true;
        deals: true;
      };
    };
  };
}>;

function formatSourceLabel(source: LeadSourceType | string): string {
  if (source in LEAD_SOURCE_LABELS) {
    return LEAD_SOURCE_LABELS[source as LeadSourceType];
  }

  return String(source).replace(/_/g, ' ');
}

function buildSourceLabels(
  sourceRecords: ClientDetailRow['sourceRecords'],
  leadSource: string | null
) {
  const sourceLabels = [
    ...new Set(sourceRecords.map((record) => formatSourceLabel(record.source))),
  ];

  const fallbackLabel = compactString(leadSource);

  if (sourceLabels.length > 0) {
    return sourceLabels;
  }

  return fallbackLabel ? [fallbackLabel] : [];
}

function groupDuplicateKeys(
  clients: ClientIndexRow[],
  field: 'email' | 'phone',
  contactValues?: Map<string, string[]>
) {
  const groups = new Map<string, string[]>();

  function add(key: string, clientId: string) {
    const existing = groups.get(key) ?? [];
    if (!existing.includes(clientId)) {
      existing.push(clientId);
    }
    groups.set(key, existing);
  }

  for (const client of clients) {
    const rawValue = field === 'email' ? client.email : client.phone;
    const normalized =
      field === 'email' ? normalizeEmail(rawValue) : normalizePhone(rawValue);

    if (normalized) {
      add(normalized, client.id);
    }
  }

  if (contactValues) {
    for (const [normalized, clientIds] of contactValues.entries()) {
      for (const clientId of clientIds) {
        add(normalized, clientId);
      }
    }
  }

  return [...groups.entries()]
    .filter(([, clientIds]) => clientIds.length > 1)
    .map(([key, clientIds]) => ({
      type: field,
      key,
      clientIds,
    }));
}

function sortGroups(
  left: Pick<DuplicateReviewGroup, 'key' | 'clients'>,
  right: Pick<DuplicateReviewGroup, 'key' | 'clients'>
) {
  if (right.clients.length !== left.clients.length) {
    return right.clients.length - left.clients.length;
  }

  return left.key.localeCompare(right.key);
}

function mapClientDetail(client: ClientDetailRow): DuplicateReviewClient {
  return {
    clientId: client.id,
    name: client.name,
    company: client.company,
    email: client.email,
    phone: client.phone,
    leadSource: client.leadSource,
    roleInCompany: client.roleInCompany,
    employeeCount: client.employeeCount,
    expectations: client.expectations,
    contactInfo: client.contactInfo,
    status: client.status,
    createdAt: client.createdAt.toISOString(),
    lastModified: client.lastModified.toISOString(),
    sourceLabels: buildSourceLabels(client.sourceRecords, client.leadSource),
    assignedUsers: client.clientAssignments.map((assignment) => ({
      assignmentId: assignment.assignmentId,
      userId: assignment.user.id,
      name: assignment.user.name ?? assignment.user.email,
      email: assignment.user.email,
      role: assignment.role,
    })),
    activityCount:
      client._count.interactions + client._count.activityLogs,
    dealCount: client._count.deals,
    priority: client.priority,
    nextAction: client.nextAction,
    nextFollowUpAt: client.nextFollowUpAt?.toISOString() ?? null,
  };
}

export async function fetchLeadDuplicateGroups(
  options: FetchLeadDuplicateGroupsOptions = {}
): Promise<{ groups: DuplicateReviewGroup[]; meta: { count: number; limit: number } }> {
  const limit = options.limit ?? DEFAULT_GROUP_LIMIT;
  const where = options.includeArchived
    ? {}
    : { status: { not: ClientStatus.ARCHIVED } };

  const indexRows = await prisma.client.findMany({
    where,
    select: {
      id: true,
      email: true,
      phone: true,
    },
  });

  const contactRows = await prisma.clientContact.findMany({
    where: {
      client: where,
    },
    select: {
      clientId: true,
      kind: true,
      normalizedValue: true,
    },
  });

  const emailContacts = new Map<string, string[]>();
  const phoneContacts = new Map<string, string[]>();

  for (const row of contactRows) {
    const map = row.kind === 'EMAIL' ? emailContacts : phoneContacts;
    const list = map.get(row.normalizedValue) ?? [];
    if (!list.includes(row.clientId)) {
      list.push(row.clientId);
    }
    map.set(row.normalizedValue, list);
  }

  const emailGroups = groupDuplicateKeys(indexRows, 'email', emailContacts);
  const phoneGroups = groupDuplicateKeys(indexRows, 'phone', phoneContacts);

  const groupedCandidates = [...emailGroups, ...phoneGroups].sort((left, right) => {
    if (right.clientIds.length !== left.clientIds.length) {
      return right.clientIds.length - left.clientIds.length;
    }

    return left.key.localeCompare(right.key);
  });

  const limitedCandidates = groupedCandidates.slice(0, limit);
  const clientIds = [
    ...new Set(limitedCandidates.flatMap((group) => group.clientIds)),
  ];

  const clientDetails =
    clientIds.length === 0
      ? []
      : await prisma.client.findMany({
          where: { id: { in: clientIds } },
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
              select: {
                source: true,
              },
              orderBy: { receivedAt: 'desc' },
            },
            _count: {
              select: {
                interactions: true,
                activityLogs: true,
                deals: true,
              },
            },
          },
        });

  const clientsById = new Map(
    clientDetails.map((client) => [client.id, mapClientDetail(client)])
  );

  const groups: DuplicateReviewGroup[] = limitedCandidates.map((group) => ({
    type: group.type,
    key: group.key,
    clients: group.clientIds
      .map((clientId) => clientsById.get(clientId))
      .filter((client): client is DuplicateReviewClient => client !== undefined)
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ),
  }));

  groups.sort(sortGroups);

  return {
    groups,
    meta: {
      count: groups.length,
      limit,
    },
  };
}
