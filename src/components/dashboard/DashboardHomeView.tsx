'use client';

/**
 * Standard dashboard Home — intentionally free of widget imports/fetches.
 *
 * Shell (StandardUserDashboardPage) loads identity + `/api/me/assignments` for
 * nav flags and the tiny assignment-count summary below.
 * Full widget modules must NOT be imported here; open them via `?view=` only.
 */

import AppLink from '@/components/ui/app-link';
import {
  standardDashboardHref,
  type StandardDashboardView,
} from '@/components/layout/workspaceNavConfig';

const HOME_LINKS: Array<{
  view: StandardDashboardView;
  label: string;
  description: string;
  doctorOnly?: boolean;
}> = [
  {
    view: 'clients',
    label: 'My Clients',
    description: 'Assigned clients and legacy doctor lists',
  },
  {
    view: 'tasks',
    label: 'Tasks',
    description: 'Open tasks on your clients',
  },
  {
    view: 'activity',
    label: 'Activity',
    description: 'Recent updates across assigned clients',
  },
  {
    view: 'calendar',
    label: 'Calendar',
    description: 'Important dates this month',
  },
  {
    view: 'deals',
    label: 'Deals',
    description: 'Deals you participate in',
  },
  {
    view: 'commission',
    label: 'Commission',
    description: 'Your secured commission',
  },
  {
    view: 'returnables',
    label: 'Returnables',
    description: 'Current-month unpaid returnables',
    doctorOnly: true,
  },
];

export default function DashboardHomeView({
  displayName,
  showReturnables,
  showAdmin,
  onAddLead,
  showAddLead,
  assignmentCount,
  assignmentsLoading,
}: {
  displayName: string;
  showReturnables: boolean;
  showAdmin: boolean;
  onAddLead: () => void;
  showAddLead: boolean;
  assignmentCount: number | null;
  assignmentsLoading: boolean;
}) {
  const links = HOME_LINKS.filter(
    (link) => !link.doctorOnly || showReturnables
  );

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-gray-900">
          Welcome{displayName ? `, ${displayName}` : ''}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Open a workspace section from the sidebar. Only the active section loads its
          data.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {showAddLead ? (
            <button
              type="button"
              onClick={onAddLead}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
              Add Lead
            </button>
          ) : null}
          {showReturnables ? (
            <AppLink
              href="/my-statements"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              Returnable Statements
            </AppLink>
          ) : null}
          {showAdmin ? (
            <AppLink
              href="/admin"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              Admin Dashboard
            </AppLink>
          ) : null}
          <AppLink
            href="/dashboard/settings"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
          >
            Account Settings
          </AppLink>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          At a glance
        </p>
        <p className="mt-2 text-sm text-gray-700">
          {assignmentsLoading
            ? 'Loading assignment summary…'
            : assignmentCount === null
              ? 'Assignment summary unavailable.'
              : `You have ${assignmentCount} client assignment${
                  assignmentCount === 1 ? '' : 's'
                }.`}
        </p>
      </section>

      <section aria-label="Workspace shortcuts">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => (
            <AppLink
              key={link.view}
              href={standardDashboardHref(link.view)}
              className="min-w-0 select-none rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-[transform,background-color,border-color] duration-150 ease-out hover:border-blue-200 hover:bg-blue-50/40 active:scale-[0.98] active:bg-blue-50 motion-reduce:transform-none"
            >
              <p className="text-sm font-semibold text-gray-900">{link.label}</p>
              <p className="mt-1 text-xs leading-snug text-gray-600">{link.description}</p>
            </AppLink>
          ))}
        </div>
      </section>
    </div>
  );
}
