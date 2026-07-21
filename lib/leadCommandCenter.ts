import {
  ClientContactKind,
  ClientStatus,
  LeadSourceType,
  Prisma,
} from '@prisma/client';
import {
  compactString,
  normalizeEmail,
  normalizePhone,
} from '@/lib/leadNormalization';
import { buildContactSearchOr } from '@/lib/clientContacts';
import { timeAsync } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

/** Defensive caps for candidate-based duplicate peer lookups (no full-table scan). */
const MAX_DUP_CANDIDATE_CLIENTS = 2_000;
const MAX_DUP_KEYS_PER_KIND = 500;
const MAX_DUP_CONTACT_PEER_ROWS = 10_000;
const MAX_DUP_SCALAR_PEER_ROWS = 2_000;
const MAX_CONTACTS_LOADED_FOR_CANDIDATES = 10_000;

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

/** Slim inbox row — table/card display + scoring inputs only. */
export type LeadCommandCenterRow = {
  clientId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  leadSource: string | null;
  createdAt: string;
  lastModified: string;
  assignedUsers: LeadCommandCenterAssignedUser[];
  sourceLabels: string[];
  latestSourceReceivedAt: string | null;
  sourceRecordCount: number;
  attentionScore: number;
  attentionReasons: string[];
  dataQualityWarnings: string[];
  duplicateWarnings: string[];
  priority: string | null;
  nextAction: string | null;
  nextFollowUpAt: string | null;
};

/** Full lead detail for the preview drawer (fetched on open). */
export type LeadCommandCenterPreview = LeadCommandCenterRow & {
  roleInCompany: string | null;
  employeeCount: number | null;
  expectations: string | null;
  sources: LeadCommandCenterSource[];
  /** True when `sources` is truncated vs `sourceRecordCount`. */
  sourcesHasMore: boolean;
  firstSourceLabel: string | null;
  latestSourceLabel: string | null;
  lastActivityAt: string | null;
  lastActivitySummary: string | null;
  tags: LeadCommandCenterTag[];
};

/** How many recent source rows to sample for inbox badges (full history is preview-only). */
const INBOX_SOURCE_SAMPLE_LIMIT = 8;

/** Cap source history rows on LCC preview (total remains in `sourceRecordCount`). */
export const PREVIEW_SOURCE_RECORD_LIMIT = 20;

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

/** Default page size for GET /api/admin/leads (UI Load more uses the same). */
export const LEAD_COMMAND_CENTER_DEFAULT_LIMIT = 50;
/** Hard cap for limit query param. */
export const LEAD_COMMAND_CENTER_MAX_LIMIT = 500;

export type LeadCommandCenterPageMeta = {
  /** Number of leads in this response page. */
  count: number;
  limit: number;
  offset: number;
  /**
   * Total matching rows for the active filter set.
   * DB path: Prisma `count` on the same `where`.
   * Fallback path: count after in-memory post-filters.
   */
  total: number;
  hasMore: boolean;
  /**
   * True when Prisma `skip`/`take` + `orderBy lastModified` served this page
   * (no in-memory post-filter / attention sort on the full match set).
   */
  dbPaginated: boolean;
  /** Present when `dbPaginated` is false — why the load-all fallback ran. */
  fallbackReason?: string;
  /**
   * `lastModified` when DB-paginated; `attention` when the fallback path
   * sorts by attentionScore → latestSource → lastModified.
   */
  sortMode: 'lastModified' | 'attention';
};

export type LeadCommandCenterPageResult = {
  leads: LeadCommandCenterRow[];
  meta: LeadCommandCenterPageMeta;
};

/**
 * Post-filters / sort that cannot run in Prisma without persisted columns.
 * When any apply, the list loads the full match set, hydrates, filters, sorts,
 * then slices (correctness over SQL pagination).
 */
export type LeadCommandCenterSqlPaginationDecision =
  | { dbPaginated: true }
  | { dbPaginated: false; fallbackReason: string };

/** Set `LCC_SQL_PAGINATION=false` to force the load-all fallback path. */
function isSqlPaginationEnvEnabled(): boolean {
  return process.env.LCC_SQL_PAGINATION !== 'false';
}

/**
 * Decide whether this request can use Prisma skip/take.
 * Safe when only Prisma `where` filters are active and a positive page limit is set.
 */
export function decideLeadCommandCenterSqlPagination(
  filters: LeadCommandCenterFilters
): LeadCommandCenterSqlPaginationDecision {
  if (!isSqlPaginationEnvEnabled()) {
    return {
      dbPaginated: false,
      fallbackReason: 'LCC_SQL_PAGINATION=false',
    };
  }

  if (filters.duplicateEmail === true) {
    return {
      dbPaginated: false,
      fallbackReason: 'duplicateEmail requires in-memory duplicateWarnings',
    };
  }

  if (filters.duplicatePhone === true) {
    return {
      dbPaginated: false,
      fallbackReason: 'duplicatePhone requires in-memory duplicateWarnings',
    };
  }

  if (filters.needsAttention === true) {
    return {
      dbPaginated: false,
      fallbackReason: 'needsAttention requires computed attentionScore',
    };
  }

  if (filters.latestSourceFrom?.trim() || filters.latestSourceTo?.trim()) {
    return {
      dbPaginated: false,
      fallbackReason: 'latestSource date range requires computed latestSourceReceivedAt',
    };
  }

  const requestedLimit = filters.limit;
  if (requestedLimit === undefined || requestedLimit <= 0) {
    return {
      dbPaginated: false,
      fallbackReason: 'unlimited fetch requested (no positive limit)',
    };
  }

  return { dbPaginated: true };
}

const inboxSqlOrderBy = [
  { lastModified: 'desc' as const },
  { id: 'desc' as const },
];

const leadCommandCenterAssignmentSelect = {
  assignmentId: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.ClientAssignmentSelect;

/** Inbox list query — capped source sample, no tags / expectations / full history. */
export const leadCommandCenterInboxSelect = {
  id: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  status: true,
  leadSource: true,
  createdAt: true,
  lastModified: true,
  priority: true,
  nextAction: true,
  nextFollowUpAt: true,
  clientAssignments: {
    select: leadCommandCenterAssignmentSelect,
  },
  sourceRecords: {
    orderBy: { receivedAt: 'desc' as const },
    take: INBOX_SOURCE_SAMPLE_LIMIT,
    select: {
      source: true,
      receivedAt: true,
    },
  },
  _count: {
    select: {
      sourceRecords: true,
    },
  },
} satisfies Prisma.ClientSelect;

/** Preview drawer select — capped recent sources + tags + profile fields. */
export const leadCommandCenterPreviewSelect = {
  id: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  status: true,
  leadSource: true,
  roleInCompany: true,
  employeeCount: true,
  expectations: true,
  createdAt: true,
  lastModified: true,
  priority: true,
  nextAction: true,
  nextFollowUpAt: true,
  clientAssignments: {
    select: leadCommandCenterAssignmentSelect,
  },
  // Loaded with the base row so preview skips a second contacts round-trip.
  contacts: {
    where: {
      kind: { in: [ClientContactKind.EMAIL, ClientContactKind.PHONE] },
    },
    select: {
      kind: true,
      normalizedValue: true,
    },
  },
  sourceRecords: {
    orderBy: { receivedAt: 'desc' as const },
    take: PREVIEW_SOURCE_RECORD_LIMIT,
    select: {
      source: true,
      externalId: true,
      receivedAt: true,
    },
  },
  _count: {
    select: {
      sourceRecords: true,
    },
  },
  tags: {
    select: {
      tag: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  },
} satisfies Prisma.ClientSelect;

/** @deprecated Prefer leadCommandCenterInboxSelect or leadCommandCenterPreviewSelect */
export const leadCommandCenterClientSelect = leadCommandCenterPreviewSelect;

type InboxClientWithRelations = Prisma.ClientGetPayload<{
  select: typeof leadCommandCenterInboxSelect;
}>;

type PreviewClientWithRelations = Prisma.ClientGetPayload<{
  select: typeof leadCommandCenterPreviewSelect;
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

type DuplicateCandidateContact = {
  kind: ClientContactKind;
  normalizedValue: string;
};

type DuplicateCandidate = {
  id: string;
  email: string | null;
  phone: string | null;
  contacts?: DuplicateCandidateContact[];
};

function addClientToDupGroup(
  map: Map<string, string[]>,
  key: string,
  clientId: string
) {
  const group = map.get(key) ?? [];
  if (!group.includes(clientId)) {
    group.push(clientId);
  }
  map.set(key, group);
}

function finalizeDuplicateSets(
  emailGroups: Map<string, string[]>,
  phoneGroups: Map<string, string[]>
): DuplicateClientIds {
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

/**
 * Candidate-based duplicate detection for LCC inbox / preview.
 *
 * Seeds keys from the provided clients (scalar email/phone + their contacts),
 * then peer-looks up matching ClientContact rows and scalar Client email/phone
 * for those keys only — does not scan all clients/contacts.
 *
 * Exact peers via contact.normalizedValue or scalar email (case-insensitive key)
 * / scalar phone equal to a candidate raw phone. May miss scalar-only peers with
 * differently formatted phones and no contact row. /api/admin/leads/duplicates
 * remains the full/exact grouping path.
 */
async function loadDuplicateClientIdsForCandidates(
  candidates: DuplicateCandidate[]
): Promise<DuplicateClientIds> {
  if (candidates.length === 0) {
    return { emailDuplicates: new Set(), phoneDuplicates: new Set() };
  }

  const cappedCandidates =
    candidates.length > MAX_DUP_CANDIDATE_CLIENTS
      ? candidates.slice(0, MAX_DUP_CANDIDATE_CLIENTS)
      : candidates;

  const emailGroups = new Map<string, string[]>();
  const phoneGroups = new Map<string, string[]>();
  const emailKeys = new Set<string>();
  const phoneKeys = new Set<string>();
  const rawPhones = new Set<string>();

  for (const client of cappedCandidates) {
    const normalizedEmail = normalizeEmail(client.email);
    if (normalizedEmail) {
      emailKeys.add(normalizedEmail);
      addClientToDupGroup(emailGroups, normalizedEmail, client.id);
    }

    const normalizedPhone = normalizePhone(client.phone);
    if (normalizedPhone) {
      phoneKeys.add(normalizedPhone);
      addClientToDupGroup(phoneGroups, normalizedPhone, client.id);
    }

    if (client.phone?.trim()) {
      rawPhones.add(client.phone.trim());
    }

    for (const contact of client.contacts ?? []) {
      if (!contact.normalizedValue) {
        continue;
      }

      if (contact.kind === ClientContactKind.EMAIL) {
        emailKeys.add(contact.normalizedValue);
        addClientToDupGroup(emailGroups, contact.normalizedValue, client.id);
      } else if (contact.kind === ClientContactKind.PHONE) {
        phoneKeys.add(contact.normalizedValue);
        addClientToDupGroup(phoneGroups, contact.normalizedValue, client.id);
      }
    }
  }

  const emailKeyList = [...emailKeys].slice(0, MAX_DUP_KEYS_PER_KIND);
  const phoneKeyList = [...phoneKeys].slice(0, MAX_DUP_KEYS_PER_KIND);
  const rawPhoneList = [...rawPhones].slice(0, MAX_DUP_KEYS_PER_KIND);

  const contactOr: Prisma.ClientContactWhereInput[] = [];
  if (emailKeyList.length > 0) {
    contactOr.push({
      kind: ClientContactKind.EMAIL,
      normalizedValue: { in: emailKeyList },
    });
  }
  if (phoneKeyList.length > 0) {
    contactOr.push({
      kind: ClientContactKind.PHONE,
      normalizedValue: { in: phoneKeyList },
    });
  }

  const scalarOr: Prisma.ClientWhereInput[] = [];
  if (emailKeyList.length > 0) {
    scalarOr.push({
      email: { in: emailKeyList, mode: 'insensitive' },
    });
  }
  if (rawPhoneList.length > 0) {
    scalarOr.push({
      phone: { in: rawPhoneList },
    });
  }

  const [contactPeers, scalarPeers] = await Promise.all([
    contactOr.length === 0
      ? Promise.resolve(
          [] as Array<{
            clientId: string;
            kind: ClientContactKind;
            normalizedValue: string;
          }>
        )
      : prisma.clientContact.findMany({
          where: { OR: contactOr },
          select: {
            clientId: true,
            kind: true,
            normalizedValue: true,
          },
          take: MAX_DUP_CONTACT_PEER_ROWS,
        }),
    scalarOr.length === 0
      ? Promise.resolve(
          [] as Array<{ id: string; email: string | null; phone: string | null }>
        )
      : prisma.client.findMany({
          where: { OR: scalarOr },
          select: {
            id: true,
            email: true,
            phone: true,
          },
          take: MAX_DUP_SCALAR_PEER_ROWS,
        }),
  ]);

  for (const contact of contactPeers) {
    if (contact.kind === ClientContactKind.EMAIL) {
      addClientToDupGroup(emailGroups, contact.normalizedValue, contact.clientId);
    } else if (contact.kind === ClientContactKind.PHONE) {
      addClientToDupGroup(phoneGroups, contact.normalizedValue, contact.clientId);
    }
  }

  for (const peer of scalarPeers) {
    const normalizedEmail = normalizeEmail(peer.email);
    if (normalizedEmail && emailKeys.has(normalizedEmail)) {
      addClientToDupGroup(emailGroups, normalizedEmail, peer.id);
    }

    const normalizedPhone = normalizePhone(peer.phone);
    if (normalizedPhone && phoneKeys.has(normalizedPhone)) {
      addClientToDupGroup(phoneGroups, normalizedPhone, peer.id);
    }
  }

  return finalizeDuplicateSets(emailGroups, phoneGroups);
}

/**
 * Preview-only duplicate flags for a single client.
 * Same semantics as {@link loadDuplicateClientIdsForCandidates} for warnings on
 * this clientId, but uses peer `findFirst` existence checks instead of loading
 * full peer row sets (inbox batch path keeps the candidate peer lookup).
 */
async function loadDuplicateFlagsForPreviewCandidate(
  candidate: DuplicateCandidate
): Promise<DuplicateClientIds> {
  const emailKeys = new Set<string>();
  const phoneKeys = new Set<string>();
  const rawPhones = new Set<string>();

  const normalizedEmail = normalizeEmail(candidate.email);
  if (normalizedEmail) {
    emailKeys.add(normalizedEmail);
  }

  const normalizedPhone = normalizePhone(candidate.phone);
  if (normalizedPhone) {
    phoneKeys.add(normalizedPhone);
  }

  if (candidate.phone?.trim()) {
    rawPhones.add(candidate.phone.trim());
  }

  for (const contact of candidate.contacts ?? []) {
    if (!contact.normalizedValue) {
      continue;
    }
    if (contact.kind === ClientContactKind.EMAIL) {
      emailKeys.add(contact.normalizedValue);
    } else if (contact.kind === ClientContactKind.PHONE) {
      phoneKeys.add(contact.normalizedValue);
    }
  }

  const emailKeyList = [...emailKeys].slice(0, MAX_DUP_KEYS_PER_KIND);
  const phoneKeyList = [...phoneKeys].slice(0, MAX_DUP_KEYS_PER_KIND);
  const rawPhoneList = [...rawPhones].slice(0, MAX_DUP_KEYS_PER_KIND);

  const [emailContactPeer, phoneContactPeer, emailScalarPeer, phoneScalarPeer] =
    await Promise.all([
      emailKeyList.length === 0
        ? Promise.resolve(null)
        : prisma.clientContact.findFirst({
            where: {
              clientId: { not: candidate.id },
              kind: ClientContactKind.EMAIL,
              normalizedValue: { in: emailKeyList },
            },
            select: { id: true },
          }),
      phoneKeyList.length === 0
        ? Promise.resolve(null)
        : prisma.clientContact.findFirst({
            where: {
              clientId: { not: candidate.id },
              kind: ClientContactKind.PHONE,
              normalizedValue: { in: phoneKeyList },
            },
            select: { id: true },
          }),
      emailKeyList.length === 0
        ? Promise.resolve(null)
        : prisma.client.findFirst({
            where: {
              id: { not: candidate.id },
              email: { in: emailKeyList, mode: 'insensitive' },
            },
            select: { id: true },
          }),
      rawPhoneList.length === 0
        ? Promise.resolve(null)
        : prisma.client.findFirst({
            where: {
              id: { not: candidate.id },
              phone: { in: rawPhoneList },
            },
            select: { id: true },
          }),
    ]);

  const emailDuplicates = new Set<string>();
  const phoneDuplicates = new Set<string>();

  if (emailContactPeer || emailScalarPeer) {
    emailDuplicates.add(candidate.id);
  }
  if (phoneContactPeer || phoneScalarPeer) {
    phoneDuplicates.add(candidate.id);
  }

  return { emailDuplicates, phoneDuplicates };
}

async function loadContactsForClientIds(
  clientIds: string[]
): Promise<Map<string, DuplicateCandidateContact[]>> {
  const byClient = new Map<string, DuplicateCandidateContact[]>();
  if (clientIds.length === 0) {
    return byClient;
  }

  const cappedIds =
    clientIds.length > MAX_DUP_CANDIDATE_CLIENTS
      ? clientIds.slice(0, MAX_DUP_CANDIDATE_CLIENTS)
      : clientIds;

  const rows = await prisma.clientContact.findMany({
    where: {
      clientId: { in: cappedIds },
      kind: { in: [ClientContactKind.EMAIL, ClientContactKind.PHONE] },
    },
    select: {
      clientId: true,
      kind: true,
      normalizedValue: true,
    },
    take: MAX_CONTACTS_LOADED_FOR_CANDIDATES,
  });

  for (const row of rows) {
    const list = byClient.get(row.clientId) ?? [];
    list.push({
      kind: row.kind,
      normalizedValue: row.normalizedValue,
    });
    byClient.set(row.clientId, list);
  }

  return byClient;
}

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
        { leadSource: { contains: search, mode: 'insensitive' } },
        ...buildContactSearchOr(search),
      ],
    });
  }

  if (and.length === 0) {
    return {};
  }

  return { AND: and };
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

/** Lightweight timestamps only — used for inbox attention scoring (no summary text). */
async function loadLatestActivityTimestampsByClientId(
  clientIds: string[]
): Promise<Map<string, Date>> {
  if (clientIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<
    Array<{ client_id: string; activity_date: Date }>
  >(Prisma.sql`
    SELECT
      client_id,
      MAX(activity_date) AS activity_date
    FROM (
      SELECT i."clientId" AS client_id, i.date AS activity_date
      FROM "Interaction" i
      WHERE i."clientId" IN (${Prisma.join(clientIds)})
      UNION ALL
      SELECT cal.client_id AS client_id, cal.created_at AS activity_date
      FROM client_activity_logs cal
      WHERE cal.client_id IN (${Prisma.join(clientIds)})
    ) combined
    GROUP BY client_id
  `);

  const activityByClientId = new Map<string, Date>();
  for (const row of rows) {
    activityByClientId.set(row.client_id, row.activity_date);
  }

  return activityByClientId;
}

async function loadLatestActivityForClient(
  clientId: string
): Promise<LatestActivityRow | undefined> {
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
      WHERE i."clientId" = ${clientId}
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
      WHERE cal.client_id = ${clientId}
    )
    SELECT
      client_id,
      activity_date,
      activity_type,
      content,
      activity_source,
      user_name,
      user_email
    FROM combined
    ORDER BY activity_date DESC
    LIMIT 1
  `);

  return rows[0];
}

type SourceRecordLike = {
  source: LeadSourceType | string;
  receivedAt: Date;
  externalId?: string | null;
};

function buildSourcePresentation(
  sourceRecords: SourceRecordLike[],
  leadSource: string | null,
  sourceRecordCount = sourceRecords.length
) {
  const sources: LeadCommandCenterSource[] = sourceRecords.map((record) => ({
    source: String(record.source),
    externalId: record.externalId ?? null,
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
    sourceRecordCount,
  };
}

function mapAssignedUsers(
  clientAssignments: InboxClientWithRelations['clientAssignments']
): LeadCommandCenterAssignedUser[] {
  return clientAssignments.map((assignment) => ({
    assignmentId: assignment.assignmentId,
    userId: assignment.user.id,
    name: assignment.user.name ?? assignment.user.email,
    email: assignment.user.email,
    role: assignment.role,
  }));
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

function mapInboxClientToRow(
  client: InboxClientWithRelations,
  duplicateClientIds: DuplicateClientIds,
  lastActivityAt: string | null
): LeadCommandCenterRow {
  const assignedUsers = mapAssignedUsers(client.clientAssignments);

  const sourcePresentation = buildSourcePresentation(
    client.sourceRecords,
    client.leadSource,
    client._count.sourceRecords
  );

  const dataQualityWarnings = buildDataQualityWarnings({
    email: client.email,
    phone: client.phone,
    company: client.company,
    assignedUserCount: assignedUsers.length,
    sourceRecordCount: sourcePresentation.sourceRecordCount,
  });

  const duplicateWarnings = buildDuplicateWarnings(client.id, duplicateClientIds);

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
    createdAt: client.createdAt.toISOString(),
    lastModified: client.lastModified.toISOString(),
    assignedUsers,
    sourceLabels: sourcePresentation.sourceLabels,
    latestSourceReceivedAt: sourcePresentation.latestSourceReceivedAt,
    sourceRecordCount: sourcePresentation.sourceRecordCount,
    attentionScore,
    attentionReasons,
    dataQualityWarnings,
    duplicateWarnings,
    priority: client.priority,
    nextAction: client.nextAction,
    nextFollowUpAt: client.nextFollowUpAt?.toISOString() ?? null,
  };
}

async function mapPreviewClientToDetail(
  client: PreviewClientWithRelations,
  duplicateClientIds: DuplicateClientIds,
  latestActivity: LatestActivityRow | undefined
): Promise<LeadCommandCenterPreview> {
  const assignedUsers = mapAssignedUsers(client.clientAssignments);

  const sourcePresentation = await timeAsync(
    'leadCommandCenter:preview:sources',
    async () =>
      buildSourcePresentation(
        client.sourceRecords,
        client.leadSource,
        client._count.sourceRecords
      )
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
    sourcesHasMore:
      sourcePresentation.sourceRecordCount > sourcePresentation.sources.length,
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

function resolvePageLimit(filters: LeadCommandCenterFilters): number | null {
  const requestedLimit = filters.limit;
  if (requestedLimit === undefined || requestedLimit <= 0) {
    return null;
  }

  return Math.min(
    Math.max(requestedLimit, 1),
    LEAD_COMMAND_CENTER_MAX_LIMIT
  );
}

async function hydrateInboxRows(
  clients: InboxClientWithRelations[]
): Promise<LeadCommandCenterRow[]> {
  const contactsByClientId = await loadContactsForClientIds(
    clients.map((client) => client.id)
  );

  const duplicateClientIds = await loadDuplicateClientIdsForCandidates(
    clients.map((client) => ({
      id: client.id,
      email: client.email,
      phone: client.phone,
      contacts: contactsByClientId.get(client.id) ?? [],
    }))
  );

  const latestActivityTimestamps = await loadLatestActivityTimestampsByClientId(
    clients.map((client) => client.id)
  );

  return clients.map((client) => {
    const activityDate = latestActivityTimestamps.get(client.id);
    return mapInboxClientToRow(
      client,
      duplicateClientIds,
      activityDate?.toISOString() ?? null
    );
  });
}

async function fetchLeadCommandCenterPageDbPaginated(
  where: Prisma.ClientWhereInput,
  limit: number,
  offset: number
): Promise<LeadCommandCenterPageResult> {
  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      select: leadCommandCenterInboxSelect,
      orderBy: inboxSqlOrderBy,
      skip: offset,
      take: limit,
    }),
    prisma.client.count({ where }),
  ]);

  const leads = await hydrateInboxRows(clients);
  const hasMore = offset + leads.length < total;

  return {
    leads,
    meta: {
      count: leads.length,
      limit,
      offset,
      total,
      hasMore,
      dbPaginated: true,
      sortMode: 'lastModified',
    },
  };
}

/**
 * Fallback: load all Prisma matches, hydrate, apply in-memory post-filters,
 * sort by attention, then slice. Used when dup / needsAttention / latest-source
 * filters (or unlimited fetch / env disable) prevent SQL pagination.
 */
async function fetchLeadCommandCenterPageInMemoryFallback(
  filters: LeadCommandCenterFilters,
  where: Prisma.ClientWhereInput,
  fallbackReason: string,
  limit: number | null,
  offset: number
): Promise<LeadCommandCenterPageResult> {
  const clients = await prisma.client.findMany({
    where,
    select: leadCommandCenterInboxSelect,
  });

  const rows = await hydrateInboxRows(clients);
  const filteredRows = applyPostFilters(rows, filters);
  sortRows(filteredRows);

  const pageLimit = limit ?? filteredRows.length;
  const leads =
    limit === null
      ? filteredRows.slice(offset)
      : filteredRows.slice(offset, offset + pageLimit);

  const total = filteredRows.length;
  const hasMore = offset + leads.length < total;

  return {
    leads,
    meta: {
      count: leads.length,
      limit: limit === null ? leads.length : pageLimit,
      offset,
      total,
      hasMore,
      dbPaginated: false,
      fallbackReason,
      sortMode: 'attention',
    },
  };
}

export async function fetchLeadCommandCenterPage(
  filters: LeadCommandCenterFilters = {}
): Promise<LeadCommandCenterPageResult> {
  const where = buildClientWhere(filters);
  const offset = Math.max(filters.offset ?? 0, 0);
  const limit = resolvePageLimit(filters);
  const decision = decideLeadCommandCenterSqlPagination(filters);

  if (decision.dbPaginated) {
    // decideLeadCommandCenterSqlPagination only allows this when limit > 0.
    return fetchLeadCommandCenterPageDbPaginated(
      where,
      limit ?? LEAD_COMMAND_CENTER_DEFAULT_LIMIT,
      offset
    );
  }

  return fetchLeadCommandCenterPageInMemoryFallback(
    filters,
    where,
    decision.fallbackReason,
    limit,
    offset
  );
}

/**
 * Convenience wrapper used by smoke tests / callers that only need the page rows.
 * Prefer {@link fetchLeadCommandCenterPage} when meta is needed.
 */
export async function fetchLeadCommandCenterRows(
  filters: LeadCommandCenterFilters = {}
): Promise<LeadCommandCenterRow[]> {
  const page = await fetchLeadCommandCenterPage(filters);
  return page.leads;
}

export async function fetchLeadCommandCenterPreview(
  clientId: string
): Promise<LeadCommandCenterPreview | null> {
  const trimmedId = clientId.trim();
  if (!trimmedId) {
    return null;
  }

  return timeAsync(
    'leadCommandCenter:preview',
    async () => {
      const [client, latestActivity] = await Promise.all([
        timeAsync(
          'leadCommandCenter:preview:baseQuery',
          () =>
            prisma.client.findUnique({
              where: { id: trimmedId },
              select: leadCommandCenterPreviewSelect,
            }),
          (row) => ({
            sourceRowsReturned: row?.sourceRecords.length ?? 0,
            sourceRecordCount: row?._count.sourceRecords ?? 0,
            contactRows: row?.contacts.length ?? 0,
          })
        ),
        timeAsync('leadCommandCenter:preview:activity', () =>
          loadLatestActivityForClient(trimmedId)
        ),
      ]);

      if (!client) {
        return null;
      }

      // Contacts already on the base row — keep the substep for timing continuity.
      const contacts = await timeAsync(
        'leadCommandCenter:preview:contacts',
        async () =>
          client.contacts.map((contact) => ({
            kind: contact.kind,
            normalizedValue: contact.normalizedValue,
          }))
      );

      const duplicateClientIds = await timeAsync(
        'leadCommandCenter:preview:duplicates',
        () =>
          loadDuplicateFlagsForPreviewCandidate({
            id: client.id,
            email: client.email,
            phone: client.phone,
            contacts,
          })
      );

      return timeAsync('leadCommandCenter:preview:map', async () =>
        mapPreviewClientToDetail(client, duplicateClientIds, latestActivity)
      );
    },
    (result) => ({
      clientId: trimmedId,
      found: result !== null,
    })
  );
}

const SEARCH_CANDIDATE_LIMIT = 40;

/** Slim select for command-palette / global client search (not LCC inbox). */
const clientSearchSelect = {
  id: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  status: true,
  leadSource: true,
  createdAt: true,
  lastModified: true,
  priority: true,
  nextAction: true,
  nextFollowUpAt: true,
  clientAssignments: {
    select: {
      assignmentId: true,
    },
  },
  sourceRecords: {
    orderBy: { receivedAt: 'desc' as const },
    take: INBOX_SOURCE_SAMPLE_LIMIT,
    select: {
      source: true,
      receivedAt: true,
    },
  },
  contacts: {
    select: {
      kind: true,
      value: true,
      normalizedValue: true,
    },
  },
  _count: {
    select: {
      sourceRecords: true,
    },
  },
} satisfies Prisma.ClientSelect;

type SearchClientRow = Prisma.ClientGetPayload<{
  select: typeof clientSearchSelect;
}>;

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

/** Higher = better match. Exact contact → name prefix → company prefix → contains. */
function rankClientSearchMatch(client: SearchClientRow, query: string): number {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const emailNorm = normalizeEmail(trimmed);
  const phoneNorm = normalizePhone(trimmed);

  const scalarEmail = normalizeEmail(client.email);
  const scalarPhone = normalizePhone(client.phone);

  if (
    (emailNorm && scalarEmail === emailNorm) ||
    (phoneNorm && scalarPhone === phoneNorm)
  ) {
    return 400;
  }

  for (const contact of client.contacts) {
    if (emailNorm && contact.kind === 'EMAIL' && contact.normalizedValue === emailNorm) {
      return 400;
    }
    if (phoneNorm && contact.kind === 'PHONE' && contact.normalizedValue === phoneNorm) {
      return 400;
    }
  }

  if (client.name.toLowerCase().startsWith(lower)) {
    return 300;
  }

  if (client.company?.toLowerCase().startsWith(lower)) {
    return 200;
  }

  return 100;
}

function mapSearchClientToResult(
  client: SearchClientRow,
  query: string
): ClientSearchResult & { matchRank: number; lastModifiedMs: number } {
  const sourcePresentation = buildSourcePresentation(
    client.sourceRecords,
    client.leadSource,
    client._count.sourceRecords
  );

  // Skip full-table duplicate scan + activity union for search; use lastModified
  // as activity stand-in so "no activity" rules do not inflate scores falsely.
  const lastModifiedIso = client.lastModified.toISOString();
  const { attentionScore, attentionReasons } = computeAttention({
    status: client.status,
    email: client.email,
    phone: client.phone,
    assignedUserCount: client.clientAssignments.length,
    sourceRecordCount: sourcePresentation.sourceRecordCount,
    latestSourceReceivedAt: sourcePresentation.latestSourceReceivedAt,
    lastActivityAt: lastModifiedIso,
    lastModified: lastModifiedIso,
    duplicateWarnings: [],
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
    sourceLabels: sourcePresentation.sourceLabels,
    attentionScore,
    attentionReasons,
    matchRank: rankClientSearchMatch(client, query),
    lastModifiedMs: client.lastModified.getTime(),
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
  // Same scoping as LCC filters: archived excluded; assignedUserId restricts to
  // that user's clients (standard users). Super admin omits assignedUserId.
  const where = buildClientWhere({
    search: query,
    assignedUserId: options.assignedUserId,
  });

  const clients = await prisma.client.findMany({
    where,
    take: SEARCH_CANDIDATE_LIMIT,
    orderBy: { lastModified: 'desc' },
    select: clientSearchSelect,
  });

  if (clients.length === 0) {
    return [];
  }

  return clients
    .map((client) => mapSearchClientToResult(client, query))
    .sort((left, right) => {
      if (right.matchRank !== left.matchRank) {
        return right.matchRank - left.matchRank;
      }
      if (right.attentionScore !== left.attentionScore) {
        return right.attentionScore - left.attentionScore;
      }
      return right.lastModifiedMs - left.lastModifiedMs;
    })
    .slice(0, limit)
    .map((row) => ({
      clientId: row.clientId,
      name: row.name,
      company: row.company,
      email: row.email,
      phone: row.phone,
      status: row.status,
      sourceLabels: row.sourceLabels,
      attentionScore: row.attentionScore,
      attentionReasons: row.attentionReasons,
    }));
}
