'use client';

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getWidgetPaddingClass } from '@/components/ui/displayDensity';
import type { GroupedClientActivity } from '@/lib/dashboardTypes';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type CollapsibleActivityWidgetProps = {
  recentActivity?: GroupedClientActivity[];
  title?: string;
  refreshKey?: number;
  maxVisibleGroups?: number;
  maxVisibleActivitiesPerGroup?: number;
  showOuterTitle?: boolean;
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
  maxVisibleGroups,
  maxVisibleActivitiesPerGroup = 3,
  showOuterTitle = true,
}: CollapsibleActivityWidgetProps) {
  const { density } = useDisplayDensity();
  const widgetPaddingClass = getWidgetPaddingClass(density);
  const [fetchedActivity, setFetchedActivity] = useState<GroupedClientActivity[]>([]);
  const [loading, setLoading] = useState(recentActivityProp === undefined);
  const [error, setError] = useState<string | null>(null);
  const [readActivityIds, setReadActivityIds] = useState<Set<string>>(() => new Set());
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [expandedActivityGroups, setExpandedActivityGroups] = useState<Set<string>>(
    () => new Set()
  );

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
  const visibleGroups =
    maxVisibleGroups && !showAllGroups
      ? activityGroups.slice(0, maxVisibleGroups)
      : activityGroups;
  const hiddenGroupCount =
    maxVisibleGroups && !showAllGroups
      ? Math.max(activityGroups.length - maxVisibleGroups, 0)
      : 0;

  return (
    <section className={showOuterTitle ? `rounded-xl border border-gray-200 bg-white shadow-sm ${widgetPaddingClass}` : ''}>
      {showOuterTitle && title ? (
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      ) : showOuterTitle ? (
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Recent activity
        </p>
      ) : null}

      {recentActivityProp === undefined && loading ? (
        <div className={`${showOuterTitle ? 'mt-2.5' : ''} divide-y divide-gray-200 rounded-lg border border-gray-200`}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex w-full items-center justify-between gap-3 px-3 py-2"
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
        <p className={`${showOuterTitle ? 'mt-2.5' : ''} text-sm text-red-600`}>{error}</p>
      ) : !hasActivity ? (
        <p className={`${showOuterTitle ? 'mt-2.5' : ''} text-sm text-gray-500`}>No recent activity yet.</p>
      ) : (
        <>
          <div className={`${showOuterTitle ? 'mt-2.5' : ''} divide-y divide-gray-200 rounded-lg border border-gray-200`}>
            {visibleGroups.map((group) => {
              const showAllActivities = expandedActivityGroups.has(group.clientId);
              const visibleActivities = showAllActivities
                ? group.activities
                : group.activities.slice(0, maxVisibleActivitiesPerGroup);
              const hiddenActivityCount = Math.max(
                group.activities.length - visibleActivities.length,
                0
              );

              return (
              <Disclosure key={group.clientId} as="div">
                {({ open }) => (
                  <>
                    <DisclosureButton
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 active:bg-gray-100"
                      onClick={() => {
                        if (!open) {
                          void markClientActivitiesAsRead(group.clientId);
                        }
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">
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

                    <DisclosurePanel className="border-t border-gray-100 bg-gray-50 px-3 py-2">
                      <ul className="space-y-1.5">
                        {visibleActivities.map((activity) => (
                          <li key={activity.activityId}>
                            <Link
                              href={`/clients/${group.clientId}#activity-notes`}
                              className="flex items-start gap-2 rounded-md px-2 py-1.5 transition hover:bg-white active:bg-gray-100"
                            >
                              {activity.isUnread ? <UnreadIndicator /> : null}
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm text-gray-800">
                                  {activity.log}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {formatTimestamp(activity.timestamp)}
                                </p>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {hiddenActivityCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedActivityGroups((current) => {
                              const next = new Set(current);
                              next.add(group.clientId);
                              return next;
                            })
                          }
                          className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Show {hiddenActivityCount} more update
                          {hiddenActivityCount === 1 ? '' : 's'}
                        </button>
                      )}
                      {showAllActivities && group.activities.length > maxVisibleActivitiesPerGroup && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedActivityGroups((current) => {
                              const next = new Set(current);
                              next.delete(group.clientId);
                              return next;
                            })
                          }
                          className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Show fewer updates
                        </button>
                      )}
                    </DisclosurePanel>
                  </>
                )}
              </Disclosure>
              );
            })}
          </div>

          {hiddenGroupCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllGroups((current) => !current)}
              className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {showAllGroups
                ? 'Show fewer'
                : `Show ${hiddenGroupCount} more client group${hiddenGroupCount === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
