'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { memo, useCallback, useEffect, useState } from 'react';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type { MergeClientsSummary } from '@/lib/clientMerge';
import { formatClientStage, getStatusBadgeStyles } from '@/lib/clientStages';
import type {
  DuplicateReviewClient,
  DuplicateReviewGroup,
} from '@/lib/leadDuplicates';

const MergeClientsModal = dynamic(
  () => import('@/components/admin/MergeClientsModal'),
  { ssr: false }
);

type DuplicatesApiResponse = {
  groups: DuplicateReviewGroup[];
  meta?: {
    count: number;
    limit: number;
  };
};

type LeadDuplicatesPanelProps = {
  onMergeSuccess?: () => void;
};

function formatAssignedUsersSummary(client: DuplicateReviewClient) {
  if (client.assignedUsers.length === 0) {
    return 'Unassigned';
  }

  return client.assignedUsers
    .map((user) => `${user.name} (${user.role.replace(/_/g, ' ')})`)
    .join(', ');
}

function duplicateTypeLabel(type: DuplicateReviewGroup['type']) {
  return type === 'email' ? 'Email' : 'Phone';
}

const DuplicateClientTableRow = memo(function DuplicateClientTableRow({
  client,
}: {
  client: DuplicateReviewClient;
}) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">{client.name}</p>
        {client.company && <p className="mt-1 text-xs text-gray-500">{client.company}</p>}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadgeStyles(client.status)}`}
        >
          {formatClientStage(client.status)}
        </span>
      </td>
      <td className="px-4 py-3">
        <LeadSourceBadges sources={client.sourceLabels} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        <p>{client.email ?? <span className="text-gray-400">Missing</span>}</p>
        <p className="mt-1">{client.phone ?? <span className="text-gray-400">Missing</span>}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {formatAssignedUsersSummary(client)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{client.activityCount}</td>
      <td className="px-4 py-3 text-sm text-gray-700">{client.dealCount}</td>
      <td className="px-4 py-3">
        <Link
          href={`/clients/${client.clientId}`}
          className="inline-flex rounded-lg border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          Open Client 360
        </Link>
      </td>
    </tr>
  );
});

const DuplicateClientMobileCard = memo(function DuplicateClientMobileCard({
  client,
}: {
  client: DuplicateReviewClient;
}) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900">{client.name}</p>
          {client.company && <p className="mt-1 text-sm text-gray-500">{client.company}</p>}
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadgeStyles(client.status)}`}
        >
          {formatClientStage(client.status)}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Sources</p>
          <div className="mt-1">
            <LeadSourceBadges sources={client.sourceLabels} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Contact</p>
          <p className="mt-1 text-sm text-gray-700">
            {client.email ?? <span className="text-gray-400">Missing email</span>}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {client.phone ?? <span className="text-gray-400">Missing phone</span>}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Assigned users
          </p>
          <p className="mt-1 text-sm text-gray-700">{formatAssignedUsersSummary(client)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Activity
            </p>
            <p className="mt-1 text-sm text-gray-700">{client.activityCount}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Deals</p>
            <p className="mt-1 text-sm text-gray-700">{client.dealCount}</p>
          </div>
        </div>

        <Link
          href={`/clients/${client.clientId}`}
          className="inline-flex rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          Open Client 360
        </Link>
      </div>
    </article>
  );
});

function DuplicateGroupSection({
  group,
  onMerge,
}: {
  group: DuplicateReviewGroup;
  onMerge: (group: DuplicateReviewGroup) => void;
}) {
  function handleOpenAllClients() {
    for (const client of group.clients) {
      window.open(`/clients/${client.clientId}`, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {duplicateTypeLabel(group.type)} duplicate
          </p>
          <p className="mt-1 break-all text-sm font-medium text-gray-900">{group.key}</p>
          <p className="mt-1 text-sm text-gray-500">
            {group.clients.length} possible duplicate{group.clients.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {group.clients.length >= 2 && (
            <button
              type="button"
              onClick={() => onMerge(group)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Merge
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenAllClients}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
          >
            Open clients
          </button>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Name / Company
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Sources</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Assigned users
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Activity</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Deals</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {group.clients.map((client) => (
                <DuplicateClientTableRow key={client.clientId} client={client} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 p-4 lg:hidden">
        {group.clients.map((client) => (
          <DuplicateClientMobileCard key={client.clientId} client={client} />
        ))}
      </div>
    </section>
  );
}

function DuplicatesLoadingState() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-56 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  );
}

export default function LeadDuplicatesPanel({
  onMergeSuccess,
}: LeadDuplicatesPanelProps) {
  const [groups, setGroups] = useState<DuplicateReviewGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mergeGroup, setMergeGroup] = useState<DuplicateReviewGroup | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadDuplicates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch('/api/admin/leads/duplicates');

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to load duplicates'
        );
      }

      const data = (await response.json()) as DuplicatesApiResponse;
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load duplicates'
      );
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  function openMerge(group: DuplicateReviewGroup) {
    setMergeGroup(group);
    setMergeOpen(true);
    setSuccessMessage(null);
  }

  function closeMerge() {
    setMergeOpen(false);
    setMergeGroup(null);
  }

  function handleMerged(summary: MergeClientsSummary) {
    const conflictCount =
      summary.conflicts.assignments.length + summary.conflicts.sourceRecords.length;
    const conflictSuffix =
      conflictCount > 0 ? ` ${conflictCount} conflict(s) recorded in audit.` : '';

    setSuccessMessage(
      `Merged clients successfully. Duplicate archived.${conflictSuffix}`
    );
    void loadDuplicates();
    onMergeSuccess?.();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-600">
          Review possible duplicates and merge one duplicate into a canonical client
          at a time. Related records move to the canonical client and the duplicate
          is archived.
        </p>
      </section>

      {successMessage && (
        <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {successMessage}
        </section>
      )}

      {error ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </section>
      ) : loading ? (
        <DuplicatesLoadingState />
      ) : groups.length === 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          No duplicate groups found.
        </section>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Showing {groups.length} duplicate group{groups.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-6">
            {groups.map((group) => (
              <DuplicateGroupSection
                key={`${group.type}-${group.key}`}
                group={group}
                onMerge={openMerge}
              />
            ))}
          </div>
        </>
      )}

      <MergeClientsModal
        open={mergeOpen}
        group={mergeGroup}
        onClose={closeMerge}
        onMerged={handleMerged}
      />
    </div>
  );
}
