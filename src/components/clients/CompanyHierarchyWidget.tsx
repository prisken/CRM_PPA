'use client';

import Link from 'next/link';
import { memo, useState } from 'react';
import { formatClientStage } from '@/lib/clientStages';
import type { Client360CompanyHierarchyData } from '@/lib/client360';

type CompanyHierarchyWidgetProps = {
  clientId: string;
  hierarchy: Client360CompanyHierarchyData;
  onMutationSuccess?: () => void;
};

export default memo(function CompanyHierarchyWidget({
  clientId,
  hierarchy,
  onMutationSuccess,
}: CompanyHierarchyWidgetProps) {
  const [fullName, setFullName] = useState('');
  const [roleInCompany, setRoleInCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      onMutationSuccess?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add employee lead');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Company Hierarchy</h3>

      <dl className="mt-4 grid gap-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Company
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">
            {hierarchy.company?.trim() ? hierarchy.company : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Employee Count
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900">
            {hierarchy.employeeCount !== null && hierarchy.employeeCount !== undefined
              ? hierarchy.employeeCount
              : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <h4 className="text-sm font-semibold text-gray-900">
          Others at this company
        </h4>
        {!hierarchy.company?.trim() ? (
          <p className="mt-2 text-sm text-gray-500">
            Set a company name on this client to see related contacts.
          </p>
        ) : hierarchy.colleagues.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            No other clients share this company yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {hierarchy.colleagues.map((colleague) => (
              <li
                key={colleague.client_id}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <Link
                  href={`/clients/${colleague.client_id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {colleague.name}
                </Link>
                <p className="mt-0.5 text-xs text-gray-600">
                  {colleague.roleInCompany?.trim() || 'Role not set'} ·{' '}
                  {formatClientStage(colleague.status)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3 border-t border-gray-200 pt-5">
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Adding...' : 'Add Employee Lead'}
        </button>
      </form>
    </div>
  );
});
