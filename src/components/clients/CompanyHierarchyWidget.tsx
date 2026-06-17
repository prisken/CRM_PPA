'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatClientStage } from '@/lib/clientStages';

type CompanyColleague = {
  client_id: string;
  name: string;
  roleInCompany: string | null;
  status: string;
};

type CompanyHierarchyData = {
  company: string | null;
  employeeCount: number | null;
  colleagues: CompanyColleague[];
};

type CompanyHierarchyWidgetProps = {
  clientId: string;
  refreshKey?: number;
  onMutationSuccess?: () => void;
};

export default function CompanyHierarchyWidget({
  clientId,
  refreshKey = 0,
  onMutationSuccess,
}: CompanyHierarchyWidgetProps) {
  const [data, setData] = useState<CompanyHierarchyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [roleInCompany, setRoleInCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadHierarchy = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/clients/${clientId}/employees`, {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : res.status === 404
              ? 'Company hierarchy is not available yet. Please deploy the latest app version.'
              : `Failed to load company hierarchy (${res.status})`
        );
      }

      const body = await res.json().catch(() => null);
      if (!body) {
        throw new Error('Company hierarchy returned an empty response');
      }
      setData({
        company: body.company ?? null,
        employeeCount: body.employeeCount ?? null,
        colleagues: Array.isArray(body.colleagues) ? body.colleagues : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load company hierarchy');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadHierarchy();
  }, [loadHierarchy, refreshKey]);

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
      await loadHierarchy();
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

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading company hierarchy...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Company
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {data?.company?.trim() ? data.company : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Employee Count
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {data?.employeeCount !== null && data?.employeeCount !== undefined
                  ? data.employeeCount
                  : '—'}
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <h4 className="text-sm font-semibold text-gray-900">
              Others at this company
            </h4>
            {!data?.company?.trim() ? (
              <p className="mt-2 text-sm text-gray-500">
                Set a company name on this client to see related contacts.
              </p>
            ) : data.colleagues.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                No other clients share this company yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.colleagues.map((colleague) => (
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
        </>
      )}
    </div>
  );
}
