'use client';

import Link from 'next/link';
import { memo, useEffect, useMemo, useState } from 'react';
import type {
  AdminPipelineClient,
  AdminPipelineMeta,
} from '@/lib/adminPipeline';
import { CLIENT_STAGES } from '@/lib/clientStages';

type PipelineClient = AdminPipelineClient;

const STATUS_COLUMNS = CLIENT_STAGES.map((stage) => ({
  key: stage.value,
  label: stage.label,
}));

const STATUS_OPTIONS = [{ key: 'ALL', label: 'All Statuses' }, ...STATUS_COLUMNS];

const PipelineClientCard = memo(function PipelineClientCard({
  client,
}: {
  client: PipelineClient;
}) {
  return (
    <Link
      href={`/clients/${client.client_id}`}
      className="block cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100 hover:shadow-md"
    >
      <p className="text-sm font-medium text-gray-900">{client.name}</p>
      {client.company && (
        <p className="mt-1 text-xs text-gray-500">{client.company}</p>
      )}
      {client.assignedUsers.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          {client.assignedUsers.map((u) => u.userName).join(', ')}
        </p>
      )}
    </Link>
  );
});

const PipelineColumn = memo(function PipelineColumn({
  label,
  clients,
  totalCount,
  variant,
}: {
  label: string;
  clients: PipelineClient[];
  totalCount: number;
  variant: 'desktop' | 'mobile';
}) {
  const shown = clients.length;
  const truncated = totalCount > shown;

  if (variant === 'desktop') {
    return (
      <div className="min-w-[11.5rem] flex-1 basis-[11.5rem] rounded-lg bg-gray-50 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
            {totalCount}
          </span>
        </div>
        {truncated && (
          <p className="mb-2 text-[11px] text-gray-400">
            Showing {shown} of {totalCount}
          </p>
        )}
        <div className="space-y-2">
          {clients.map((client) => (
            <PipelineClientCard key={client.client_id} client={client} />
          ))}
          {clients.length === 0 && (
            <p className="text-xs text-gray-400">No clients</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
        <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
          {totalCount}
        </span>
      </div>
      {truncated && (
        <p className="mb-2 text-[11px] text-gray-400">
          Showing {shown} of {totalCount}
        </p>
      )}
      <ul className="space-y-2">
        {clients.map((client) => (
          <li key={client.client_id}>
            <PipelineClientCard client={client} />
          </li>
        ))}
        {clients.length === 0 && (
          <li className="text-xs text-gray-400">No clients</li>
        )}
      </ul>
    </section>
  );
});

export default function MasterPipelineView({
  refreshKey = 0,
  onAddClick,
}: {
  refreshKey?: number;
  onAddClick?: () => void;
}) {
  const [clients, setClients] = useState<PipelineClient[]>([]);
  const [meta, setMeta] = useState<AdminPipelineMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignedUserFilter, setAssignedUserFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [assignedUserOptions, setAssignedUserOptions] = useState<
    { id: string; name: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchPipeline() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }
        if (assignedUserFilter !== 'ALL') {
          params.set('assignedUserId', assignedUserFilter);
        }
        const query = params.toString();
        const res = await fetch(
          query ? `/api/admin/pipeline?${query}` : '/api/admin/pipeline'
        );
        if (!res.ok) {
          throw new Error('Failed to load pipeline data');
        }
        const json = await res.json();
        if (!cancelled) {
          const nextClients: PipelineClient[] = json.clients ?? [];
          setClients(nextClients);
          setMeta(json.meta ?? null);
          setAssignedUserOptions((prev) => {
            const users = new Map(prev.map((user) => [user.id, user.name]));
            for (const client of nextClients) {
              for (const user of client.assignedUsers) {
                users.set(user.user_id, user.userName);
              }
            }
            return Array.from(users.entries())
              .map(([id, name]) => ({ id, name }))
              .sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load pipeline data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPipeline();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, statusFilter, assignedUserFilter]);

  const clientsByStatus = useMemo(() => {
    const grouped = new Map<string, PipelineClient[]>();

    for (const column of STATUS_COLUMNS) {
      grouped.set(column.key, []);
    }

    for (const client of clients) {
      const bucket = grouped.get(client.status);
      if (bucket) {
        bucket.push(client);
      }
    }

    return grouped;
  }, [clients]);

  const perStatusCounts = meta?.perStatusCounts;

  if (loading) {
    return <p className="text-sm text-gray-500">Loading pipeline...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div id="master-pipeline" className="min-w-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Master Pipeline</h2>
          {meta?.hasMore && (
            <p className="mt-1 text-xs text-gray-500">
              Showing newest {meta.returned} of {meta.total} matching clients
              {meta.perStatusLimit != null
                ? ` (up to ${meta.perStatusLimit} per stage)`
                : ''}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 sm:gap-3">
          <Link
            href="/admin/leads"
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 active:bg-blue-200"
          >
            Lead Command Center
          </Link>
          <button
            type="button"
            onClick={onAddClick}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          >
            + Add Lead / Client
          </button>
          <select
            value={assignedUserFilter}
            onChange={(e) => setAssignedUserFilter(e.target.value)}
            className="min-w-0 max-w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            <option value="ALL">All Assigned Users</option>
            {assignedUserOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-w-0 max-w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Intentional horizontal scroll for Kanban columns only — not the page. */}
      <div className="hidden lg:block">
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:gap-4">
          {STATUS_COLUMNS.map((column) => {
            const columnClients = clientsByStatus.get(column.key) ?? [];
            const totalCount =
              perStatusCounts?.[column.key] ?? columnClients.length;
            return (
              <PipelineColumn
                key={column.key}
                label={column.label}
                clients={columnClients}
                totalCount={totalCount}
                variant="desktop"
              />
            );
          })}
        </div>
      </div>

      <div className="block space-y-6 lg:hidden">
        {STATUS_COLUMNS.map((column) => {
          const columnClients = clientsByStatus.get(column.key) ?? [];
          const totalCount =
            perStatusCounts?.[column.key] ?? columnClients.length;
          return (
            <PipelineColumn
              key={column.key}
              label={column.label}
              clients={columnClients}
              totalCount={totalCount}
              variant="mobile"
            />
          );
        })}
      </div>
    </div>
  );
}
