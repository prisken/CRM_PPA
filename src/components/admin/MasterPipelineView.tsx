'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CLIENT_STAGES } from '@/lib/clientStages';

type PipelineClient = {
  client_id: string;
  name: string;
  company: string | null;
  status: string;
  assignedUsers: {
    user_id: string;
    userName: string;
    role: string;
  }[];
};

const STATUS_COLUMNS = CLIENT_STAGES.map((stage) => ({
  key: stage.value,
  label: stage.label,
}));

const STATUS_OPTIONS = [{ key: 'ALL', label: 'All Statuses' }, ...STATUS_COLUMNS];

export default function MasterPipelineView({
  refreshKey = 0,
  onAddClick,
}: {
  refreshKey?: number;
  onAddClick?: () => void;
}) {
  const [clients, setClients] = useState<PipelineClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignedUserFilter, setAssignedUserFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    let cancelled = false;

    async function fetchPipeline() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/pipeline');
        if (!res.ok) {
          throw new Error('Failed to load pipeline data');
        }
        const json = await res.json();
        if (!cancelled) {
          setClients(json.clients ?? []);
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
  }, [refreshKey]);

  const assignedUserOptions = useMemo(() => {
    const users = new Map<string, string>();
    for (const client of clients) {
      for (const user of client.assignedUsers) {
        users.set(user.user_id, user.userName);
      }
    }
    return Array.from(users.entries()).map(([id, name]) => ({ id, name }));
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const statusMatch =
        statusFilter === 'ALL' || client.status === statusFilter;
      const userMatch =
        assignedUserFilter === 'ALL' ||
        client.assignedUsers.some((user) => user.user_id === assignedUserFilter);
      return statusMatch && userMatch;
    });
  }, [clients, assignedUserFilter, statusFilter]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading pipeline...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div id="master-pipeline" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Master Pipeline</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onAddClick}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Add Lead / Client
          </button>
          <select
            value={assignedUserFilter}
            onChange={(e) => setAssignedUserFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
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
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {STATUS_COLUMNS.map((column) => {
          const columnClients = filteredClients.filter(
            (client) => client.status === column.key
          );

          return (
            <div
              key={column.key}
              className="min-w-[220px] flex-1 rounded-lg bg-gray-50 p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">{column.label}</h3>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                  {columnClients.length}
                </span>
              </div>
              <div className="space-y-2">
                {columnClients.map((client) => (
                  <Link
                    key={client.client_id}
                    href={`/clients/${client.client_id}`}
                    className="block cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 hover:shadow-md"
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
                ))}
                {columnClients.length === 0 && (
                  <p className="text-xs text-gray-400">No clients</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
