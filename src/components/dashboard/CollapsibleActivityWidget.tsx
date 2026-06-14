'use client';

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { GroupedClientActivity } from '@/lib/dashboardTypes';

type CollapsibleActivityWidgetProps = {
  recentActivity: GroupedClientActivity[];
  title?: string;
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
  recentActivity,
  title = 'Recent Activity',
}: CollapsibleActivityWidgetProps) {
  const [readActivityIds, setReadActivityIds] = useState<Set<string>>(() => new Set());

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

    const token = localStorage.getItem('token');
    const res = await fetch('/api/activity/mark-read', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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

      {!hasActivity ? (
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
