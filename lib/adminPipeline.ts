import { ClientStatus, type Prisma } from '@prisma/client';
import { CLIENT_STAGES } from '@/lib/clientStages';
import { prisma } from '@/lib/prisma';

/** Default cards loaded per pipeline status column. */
export const ADMIN_PIPELINE_PER_STATUS_LIMIT = 50;

/** Hard ceiling for `perStatusLimit` query param. */
export const ADMIN_PIPELINE_MAX_PER_STATUS_LIMIT = 200;

/** Slim assignee row for master pipeline cards + assignee filter. */
export type AdminPipelineAssignedUser = {
  user_id: string;
  userName: string;
};

/** Card/list DTO for GET /api/admin/pipeline. */
export type AdminPipelineClient = {
  client_id: string;
  name: string;
  company: string | null;
  status: string;
  assignedUsers: AdminPipelineAssignedUser[];
};

export type AdminPipelineMeta = {
  total: number;
  returned: number;
  hasMore: boolean;
  /** Counts matching filters, keyed by ClientStatus (all stages present). */
  perStatusCounts: Record<string, number>;
  /** Cap applied per status when `dbBounded` is true; null on legacy path. */
  perStatusLimit: number | null;
  limitMode: 'perStatus' | 'legacy';
  dbBounded: boolean;
  /** Present when `dbBounded` is false — why the unbounded path ran. */
  fallbackReason?: string;
  statusFilter: string;
  assignedUserId: string | null;
};

export type AdminPipelineResult = {
  clients: AdminPipelineClient[];
  meta: AdminPipelineMeta;
};

export type AdminPipelineQuery = {
  status?: string | null;
  assignedUserId?: string | null;
  /** Override default per-status take; ignored on legacy path. */
  perStatusLimit?: number | null;
  /**
   * `legacy` = unbounded findMany (temporary compatibility).
   * Default bounded unless `ADMIN_PIPELINE_LEGACY=true`.
   */
  mode?: string | null;
};

const PIPELINE_STATUSES = CLIENT_STAGES.map((stage) => stage.value);

const CLIENT_STATUS_SET = new Set<string>(Object.values(ClientStatus));

/** Explicit select — only fields needed to build {@link AdminPipelineClient}. */
export const adminPipelineClientSelect = {
  id: true,
  name: true,
  company: true,
  status: true,
  clientAssignments: {
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.ClientSelect;

type AdminPipelineClientRow = Prisma.ClientGetPayload<{
  select: typeof adminPipelineClientSelect;
}>;

export function mapAdminPipelineClient(
  client: AdminPipelineClientRow
): AdminPipelineClient {
  return {
    client_id: client.id,
    name: client.name,
    company: client.company,
    status: client.status,
    assignedUsers: client.clientAssignments.map((assignment) => ({
      user_id: assignment.user.id,
      userName: assignment.user.name ?? assignment.user.email,
    })),
  };
}

function emptyPerStatusCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of PIPELINE_STATUSES) {
    counts[status] = 0;
  }
  return counts;
}

function parseStatusFilter(raw: string | null | undefined): {
  statusFilter: string;
  status?: ClientStatus;
} {
  if (!raw || raw === 'ALL') {
    return { statusFilter: 'ALL' };
  }
  if (!CLIENT_STATUS_SET.has(raw)) {
    return { statusFilter: 'ALL' };
  }
  return { statusFilter: raw, status: raw as ClientStatus };
}

function parseAssignedUserId(raw: string | null | undefined): string | null {
  if (!raw || raw === 'ALL') {
    return null;
  }
  return raw;
}

function clampPerStatusLimit(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) {
    return ADMIN_PIPELINE_PER_STATUS_LIMIT;
  }
  return Math.min(
    Math.floor(raw),
    ADMIN_PIPELINE_MAX_PER_STATUS_LIMIT
  );
}

function buildClientWhere(
  status: ClientStatus | undefined,
  assignedUserId: string | null
): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = {};
  if (status) {
    where.status = status;
  }
  if (assignedUserId) {
    where.clientAssignments = { some: { userId: assignedUserId } };
  }
  return where;
}

async function loadPerStatusCounts(
  where: Prisma.ClientWhereInput
): Promise<{ perStatusCounts: Record<string, number>; total: number }> {
  const rows = await prisma.client.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });

  const perStatusCounts = emptyPerStatusCounts();
  let total = 0;
  for (const row of rows) {
    perStatusCounts[row.status] = row._count._all;
    total += row._count._all;
  }
  return { perStatusCounts, total };
}

function decidePipelineBound(query: AdminPipelineQuery):
  | { dbBounded: true; perStatusLimit: number }
  | { dbBounded: false; fallbackReason: string } {
  if (process.env.ADMIN_PIPELINE_LEGACY === 'true') {
    return {
      dbBounded: false,
      fallbackReason: 'ADMIN_PIPELINE_LEGACY=true',
    };
  }

  const mode = query.mode?.trim().toLowerCase();
  if (mode === 'legacy') {
    return {
      dbBounded: false,
      fallbackReason: 'mode=legacy',
    };
  }

  return {
    dbBounded: true,
    perStatusLimit: clampPerStatusLimit(query.perStatusLimit),
  };
}

function computeHasMore(
  perStatusCounts: Record<string, number>,
  returnedByStatus: Record<string, number>,
  statusFilter: string
): boolean {
  if (statusFilter !== 'ALL') {
    return (perStatusCounts[statusFilter] ?? 0) > (returnedByStatus[statusFilter] ?? 0);
  }

  return PIPELINE_STATUSES.some(
    (status) => (perStatusCounts[status] ?? 0) > (returnedByStatus[status] ?? 0)
  );
}

/**
 * Bounded master-pipeline page (default): up to `perStatusLimit` newest clients
 * per status column. Use `mode=legacy` or `ADMIN_PIPELINE_LEGACY=true` for the
 * temporary unbounded compatibility path.
 */
export async function fetchAdminPipelinePage(
  query: AdminPipelineQuery = {}
): Promise<AdminPipelineResult> {
  const { statusFilter, status } = parseStatusFilter(query.status);
  const assignedUserId = parseAssignedUserId(query.assignedUserId);
  const where = buildClientWhere(status, assignedUserId);
  const decision = decidePipelineBound(query);

  const { perStatusCounts, total } = await loadPerStatusCounts(where);

  if (!decision.dbBounded) {
    const rows = await prisma.client.findMany({
      where,
      select: adminPipelineClientSelect,
      orderBy: { createdAt: 'desc' },
    });
    const clients = rows.map(mapAdminPipelineClient);
    return {
      clients,
      meta: {
        total,
        returned: clients.length,
        hasMore: false,
        perStatusCounts,
        perStatusLimit: null,
        limitMode: 'legacy',
        dbBounded: false,
        fallbackReason: decision.fallbackReason,
        statusFilter,
        assignedUserId,
      },
    };
  }

  const perStatusLimit = decision.perStatusLimit;
  const statusesToFetch = status
    ? [status]
    : (PIPELINE_STATUSES as ClientStatus[]);

  const rowBatches = await Promise.all(
    statusesToFetch.map((columnStatus) =>
      prisma.client.findMany({
        where: { ...where, status: columnStatus },
        select: adminPipelineClientSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: perStatusLimit,
      })
    )
  );

  const clients = rowBatches.flat().map(mapAdminPipelineClient);
  const returnedByStatus = emptyPerStatusCounts();
  for (const client of clients) {
    returnedByStatus[client.status] = (returnedByStatus[client.status] ?? 0) + 1;
  }

  return {
    clients,
    meta: {
      total,
      returned: clients.length,
      hasMore: computeHasMore(perStatusCounts, returnedByStatus, statusFilter),
      perStatusCounts,
      perStatusLimit,
      limitMode: 'perStatus',
      dbBounded: true,
      statusFilter,
      assignedUserId,
    },
  };
}

/**
 * @deprecated Prefer {@link fetchAdminPipelinePage}. Unbounded load for scripts
 * that still expect a bare client array.
 */
export async function fetchAdminPipelineClients(): Promise<AdminPipelineClient[]> {
  const result = await fetchAdminPipelinePage({ mode: 'legacy' });
  return result.clients;
}
