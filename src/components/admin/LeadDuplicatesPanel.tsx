'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { memo, useCallback, useEffect, useState } from 'react';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import CompactPill from '@/components/ui/CompactPill';
import EmptyMuted from '@/components/ui/EmptyMuted';
import LimitedInlineList from '@/components/ui/LimitedInlineList';
import StatusPill from '@/components/ui/StatusPill';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type { MergeModalResult } from '@/components/admin/MergeClientsModal';
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
  refreshKey?: number;
};

function formatAssignedUserPills(client: DuplicateReviewClient) {
  return client.assignedUsers.map((user) => (
    <CompactPill
      key={user.assignmentId}
      tone="gray"
      size="xs"
      title={`${user.name} (${user.role.replace(/_/g, ' ')})`}
      className="max-w-[10rem]"
    >
      {user.name}
    </CompactPill>
  ));
}

function duplicateTypeLabel(type: DuplicateReviewGroup['type']) {
  return type === 'email' ? 'Email' : 'Phone';
}

const DuplicateClientTableRow = memo(function DuplicateClientTableRow({
  client,
}: {
  client: DuplicateReviewClient;
}) {
  const assignedPills = formatAssignedUserPills(client);

  return (
    <tr className="align-top">
      <td className="min-w-0 px-3 py-2">
        <p className="truncate font-medium text-gray-900" title={client.name}>
          {client.name}
        </p>
        {client.company && (
          <p className="mt-0.5 truncate text-xs text-gray-500" title={client.company}>
            {client.company}
          </p>
        )}
      </td>
      <td className="px-3 py-2">
        <StatusPill status={client.status} />
      </td>
      <td className="min-w-0 px-3 py-2">
        <LeadSourceBadges sources={client.sourceLabels} maxVisible={2} />
      </td>
      <td className="min-w-0 px-3 py-2 text-sm text-gray-700">
        <p className="truncate" title={client.email ?? undefined}>
          {client.email ?? <EmptyMuted />}
        </p>
        <p className="mt-0.5 truncate" title={client.phone ?? undefined}>
          {client.phone ?? <EmptyMuted />}
        </p>
      </td>
      <td className="min-w-0 px-3 py-2">
        {assignedPills.length > 0 ? (
          <LimitedInlineList
            max={2}
            moreTitle={client.assignedUsers
              .slice(2)
              .map((user) => user.name)
              .join(', ')}
            items={assignedPills}
          />
        ) : (
          <EmptyMuted label="Unassigned">Unassigned</EmptyMuted>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-gray-700">{client.activityCount}</td>
      <td className="px-3 py-2 text-sm text-gray-700">{client.dealCount}</td>
      <td className="px-3 py-2">
        <Link
          href={`/clients/${client.clientId}`}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          Open
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
  const assignedPills = formatAssignedUserPills(client);

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900" title={client.name}>
            {client.name}
          </p>
          {client.company && (
            <p className="mt-0.5 truncate text-xs text-gray-500" title={client.company}>
              {client.company}
            </p>
          )}
        </div>
        <StatusPill status={client.status} className="shrink-0" />
      </div>

      <div className="mt-2.5 space-y-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Sources</p>
          <div className="mt-1">
            <LeadSourceBadges sources={client.sourceLabels} maxVisible={2} />
          </div>
        </div>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Contact</p>
          <p className="mt-1 truncate text-sm text-gray-700" title={client.email ?? undefined}>
            {client.email ?? <EmptyMuted />}
          </p>
          <p className="mt-0.5 truncate text-sm text-gray-700" title={client.phone ?? undefined}>
            {client.phone ?? <EmptyMuted />}
          </p>
        </div>

        <details className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2">
          <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700">
            Team, activity, and deals
          </summary>
          <div className="mt-2 space-y-2 text-sm text-gray-700">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Assigned users
              </p>
              <div className="mt-1">
                {assignedPills.length > 0 ? (
                  <LimitedInlineList max={2} items={assignedPills} />
                ) : (
                  <EmptyMuted label="Unassigned">Unassigned</EmptyMuted>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Activity
                </p>
                <p className="mt-0.5">{client.activityCount}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Deals
                </p>
                <p className="mt-0.5">{client.dealCount}</p>
              </div>
            </div>
          </div>
        </details>

        <Link
          href={`/clients/${client.clientId}`}
          className="inline-flex text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
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
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {duplicateTypeLabel(group.type)} duplicate
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-gray-900" title={group.key}>
            {group.key}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {group.clients.length} possible duplicate{group.clients.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {group.clients.length >= 2 && (
            <button
              type="button"
              onClick={() => onMerge(group)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
            >
              Merge
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenAllClients}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white active:bg-gray-100"
          >
            Open all
          </button>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Name / Company
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Sources
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Contact
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Assigned
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Activity
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Deals
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Actions
                </th>
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

      <div className="space-y-2.5 p-3 lg:hidden">
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
  refreshKey = 0,
}: LeadDuplicatesPanelProps) {
  const { density } = useDisplayDensity();
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
  }, [loadDuplicates, refreshKey]);

  function openMerge(group: DuplicateReviewGroup) {
    setMergeGroup(group);
    setMergeOpen(true);
    setSuccessMessage(null);
  }

  function closeMerge() {
    setMergeOpen(false);
    setMergeGroup(null);
  }

  function handleMerged(summary: MergeModalResult) {
    const conflictCount =
      summary.conflicts.assignments.length + summary.conflicts.sourceRecords.length;
    const conflictSuffix =
      conflictCount > 0 ? ` ${conflictCount} conflict(s) recorded in audit.` : '';

    setSuccessMessage(
      `Merged clients successfully. Duplicate archived.${conflictSuffix}`
    );
    closeMerge();
    void loadDuplicates();
    onMergeSuccess?.();
  }

  return (
    <div className={density === 'compact' ? 'space-y-4' : 'space-y-5'}>
      <p className="text-sm text-gray-600">
        Review possible duplicates and merge one duplicate into a canonical client at a
        time. Related records move to the canonical client and the duplicate is archived.
      </p>

      {successMessage && (
        <section className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {successMessage}
        </section>
      )}

      {error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          {error}
        </section>
      ) : loading ? (
        <DuplicatesLoadingState />
      ) : groups.length === 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white px-3 py-6 text-center text-sm text-gray-500 shadow-sm">
          No duplicate groups found.
        </section>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Showing {groups.length} duplicate group{groups.length === 1 ? '' : 's'}
          </p>
          <div className={density === 'compact' ? 'space-y-4' : 'space-y-5'}>
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
        mode="pairwise"
        clients={mergeGroup?.clients ?? []}
        group={mergeGroup}
        onClose={closeMerge}
        onMerged={handleMerged}
      />
    </div>
  );
}
