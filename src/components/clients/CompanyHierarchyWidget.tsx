'use client';

import Link from 'next/link';
import { memo, useMemo, useState } from 'react';
import SectionCard from '@/components/ui/SectionCard';
import StatusPill from '@/components/ui/StatusPill';
import type { Client360CompanyHierarchyData } from '@/lib/client360';

type CompanyHierarchyWidgetProps = {
  clientId: string;
  hierarchy: Client360CompanyHierarchyData;
  canManageEmployees?: boolean;
  onMutationSuccess?: () => void;
};

export default memo(function CompanyHierarchyWidget({
  clientId,
  hierarchy,
  canManageEmployees = true,
  onMutationSuccess,
}: CompanyHierarchyWidgetProps) {
  const [fullName, setFullName] = useState('');
  const [roleInCompany, setRoleInCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAllColleagues, setShowAllColleagues] = useState(false);

  const hasColleagues = hierarchy.colleagues.length > 0;
  const companyLabel = hierarchy.company?.trim() || 'No company set';
  const visibleColleagues = showAllColleagues
    ? hierarchy.colleagues
    : hierarchy.colleagues.slice(0, 3);
  const hiddenColleagueCount = Math.max(
    hierarchy.colleagues.length - visibleColleagues.length,
    0
  );

  const description = useMemo(() => {
    if (!hierarchy.company?.trim()) {
      return 'Set a company to see related contacts.';
    }

    if (!hasColleagues) {
      return `${companyLabel} · No colleagues yet`;
    }

    return `${companyLabel} · ${hierarchy.colleagues.length} colleague${
      hierarchy.colleagues.length === 1 ? '' : 's'
    }`;
  }, [companyLabel, hasColleagues, hierarchy.company, hierarchy.colleagues.length]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!fullName.trim() || !roleInCompany.trim()) {
      setFormError('Full name and role are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/clients/${clientId}/employees`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          roleInCompany: roleInCompany.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Failed to add employee lead'
        );
      }

      setFullName('');
      setRoleInCompany('');
      setShowAddForm(false);
      onMutationSuccess?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add employee lead');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SectionCard
      title="Company Hierarchy"
      description={description}
      collapsible
      defaultCollapsed={!hasColleagues}
      className="shadow-sm"
    >
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Company
          </dt>
          <dd className="mt-0.5 font-medium text-gray-900">
            {hierarchy.company?.trim() ? hierarchy.company : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Employee Count
          </dt>
          <dd className="mt-0.5 font-medium text-gray-900">
            {hierarchy.employeeCount !== null && hierarchy.employeeCount !== undefined
              ? hierarchy.employeeCount
              : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Others at this company
        </h4>
        {!hierarchy.company?.trim() ? (
          <p className="mt-1.5 text-sm text-gray-500">
            Set a company name on this client to see related contacts.
          </p>
        ) : hierarchy.colleagues.length === 0 ? (
          <p className="mt-1.5 text-sm text-gray-500">
            No other clients share this company yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {visibleColleagues.map((colleague) => (
              <li
                key={colleague.client_id}
                className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5"
              >
                <Link
                  href={`/clients/${colleague.client_id}`}
                  className="block truncate text-sm font-medium text-blue-600 hover:underline"
                  title={colleague.name}
                >
                  {colleague.name}
                </Link>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                  <StatusPill status={colleague.status} className="shrink-0" />
                  <span className="truncate text-xs text-gray-600" title={colleague.roleInCompany ?? undefined}>
                    {colleague.roleInCompany?.trim() || '—'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {hiddenColleagueCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllColleagues((current) => !current)}
            className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            {showAllColleagues
              ? 'Show fewer colleagues'
              : `Show ${hiddenColleagueCount} more colleague${hiddenColleagueCount === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {canManageEmployees && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          {!showAddForm ? (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setShowAddForm(true);
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Add employee lead
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <h4 className="text-sm font-semibold text-gray-900">Add employee as lead</h4>
              <div>
                <label
                  htmlFor={`employee-full-name-${clientId}`}
                  className="mb-1 block text-xs font-medium text-gray-600"
                >
                  Full Name
                </label>
                <input
                  id={`employee-full-name-${clientId}`}
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor={`employee-role-${clientId}`}
                  className="mb-1 block text-xs font-medium text-gray-600"
                >
                  Role
                </label>
                <input
                  id={`employee-role-${clientId}`}
                  type="text"
                  value={roleInCompany}
                  onChange={(event) => setRoleInCompany(event.target.value)}
                  placeholder="Operations Manager"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Adding...' : 'Add Employee Lead'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormError(null);
                    setFullName('');
                    setRoleInCompany('');
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </SectionCard>
  );
});
