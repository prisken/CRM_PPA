'use client';

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { GroupedClientActivity } from '@/lib/dashboardTypes';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type CollapsibleActivityWidgetProps = {
  recentActivity?: GroupedClientActivity[];
  title?: string;
  refreshKey?: number;
};

function UnreadIndicator() {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold leading-none text-white"
      aria-label="Unread"
      title="Unread"
    >
      !
    </span>
  );
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function groupHasUnread(group: GroupedClientActivity) {
  return group.activities.some((activity) => activity.isUnread);
}

export default function CollapsibleActivityWidget({
  recentActivity: recentActivityProp,
  title = 'Recent Activity',
  refreshKey = 0,
}: CollapsibleActivityWidgetProps) {
  const [fetchedActivity, setFetchedActivity] = useState<GroupedClientActivity[]>([]);
  const [loading, setLoading] = useState(recentActivityProp === undefined);
  const [error, setError] = useState<string | null>(null);
  const [readActivityIds, setReadActivityIds] = useState<Set<string>>(() => new Set());

  const recentActivity = recentActivityProp ?? fetchedActivity;

  useEffect(() => {
    if (recentActivityProp !== undefined) {
      return;
    }

    let cancelled = false;

    async function loadActivityFeed() {
      setLoading(true);
      setError(null);

      try {
        const res = await authenticatedFetch('/api/dashboard/widgets/activity-feed');

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Failed to load recent activity'
          );
        }

        const data = await res.json();
        if (!cancelled) {
          setFetchedActivity(data.recentActivity ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load recent activity'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadActivityFeed();

    return () => {
      cancelled = true;
    };
  }, [recentActivityProp, refreshKey]);

  const activityGroups = useMemo(
    () =>
      recentActivity.map((group) => ({
        ...group,
        activities: group.activities.map((activity) => ({
          ...activity,
          isUnread: readActivityIds.has(activity.activityId)
            ? false
            : activity.isUnread,
        })),
      })),
    [recentActivity, readActivityIds]
  );

  async function markClientActivitiesAsRead(clientId: string) {
    const group = recentActivity.find((entry) => entry.clientId === clientId);
    if (!group) {
      return;
    }

    const unreadIds = group.activities
      .filter(
        (activity) =>
          activity.isUnread && !readActivityIds.has(activity.activityId)
      )
      .map((activity) => activity.activityId);

    if (unreadIds.length === 0) {
      return;
    }

    const res = await authenticatedFetch('/api/activity/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityLogIds: unreadIds }),
    });

    if (!res.ok) {
      return;
    }

    setReadActivityIds((current) => {
      const next = new Set(current);
      for (const id of unreadIds) {
        next.add(id);
      }
      return next;
    });
  }

  const hasActivity = activityGroups.some((group) => group.activities.length > 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

      {recentActivityProp === undefined && loading ? (
        <div className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex w-full items-center justify-between gap-3 px-4 py-3"
            >
              <div className="h-4 w-40 max-w-full animate-pulse rounded bg-gray-200" />
              <ChevronDown
                className="h-4 w-4 shrink-0 text-gray-300"
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : !hasActivity ? (
        <p className="mt-4 text-sm text-gray-500">No recent activity yet.</p>
      ) : (
        <div className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200">
          {activityGroups.map((group) => (
            <Disclosure key={group.clientId} as="div">
              {({ open }) => (
                <>
                  <DisclosureButton
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    onClick={() => {
                      if (!open) {
                        void markClientActivitiesAsRead(group.clientId);
                      }
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {group.clientName}
                      </span>
                      {groupHasUnread(group) ? <UnreadIndicator /> : null}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                        open ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </DisclosureButton>

                  <DisclosurePanel className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <ul className="space-y-2">
                      {group.activities.map((activity) => (
                        <li key={activity.activityId}>
                          <Link
                            href={`/clients/${group.clientId}#activity-notes`}
                            className="flex items-start gap-2 rounded-md px-2 py-2 transition hover:bg-white"
                          >
                            {activity.isUnread ? <UnreadIndicator /> : null}
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800">{activity.log}</p>
                              <p className="mt-1 text-xs text-gray-500">
                                {formatTimestamp(activity.timestamp)}
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </DisclosurePanel>
                </>
              )}
            </Disclosure>
          ))}
        </div>
      )}
    </section>
  );
}
