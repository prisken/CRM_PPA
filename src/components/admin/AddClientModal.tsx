'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CLIENT_STAGES } from '@/lib/clientStages';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

const initialFormData = {
  name: '',
  company: '',
  email: '',
  phone: '',
  lead_source: '',
  role_in_company: '',
  employee_count: '',
  expectations: '',
  status: 'NEW_LEAD',
};

export default function AddClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: keyof typeof initialFormData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await authenticatedFetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          company: formData.company.trim() || null,
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          lead_source: formData.lead_source.trim() || null,
          role_in_company: formData.role_in_company.trim() || null,
          employee_count: formData.employee_count.trim() || null,
          expectations: formData.expectations.trim() || null,
          status: formData.status,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to create client'
        );
      }

      const client = await res.json();
      onCreated();
      onClose();
      router.push(`/clients/${client.client_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">Add Lead / Client</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a new lead and assign their pipeline stage.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="client-name"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Name *
              </label>
              <input
                id="client-name"
                type="text"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Client or lead name"
              />
            </div>

            <div>
              <label
                htmlFor="client-company"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Company
              </label>
              <input
                id="client-company"
                type="text"
                value={formData.company}
                onChange={(e) => updateField('company', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Company name"
              />
            </div>

            <div>
              <label
                htmlFor="client-email"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <input
                id="client-email"
                type="email"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="client-phone"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Phone
              </label>
              <input
                id="client-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Phone number"
              />
            </div>

            <div>
              <label
                htmlFor="client-lead-source"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Lead Source
              </label>
              <input
                id="client-lead-source"
                type="text"
                value={formData.lead_source}
                onChange={(e) => updateField('lead_source', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Referral, Paid Ads"
              />
            </div>

            <div>
              <label
                htmlFor="client-role-in-company"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Role in Company
              </label>
              <input
                id="client-role-in-company"
                type="text"
                value={formData.role_in_company}
                onChange={(e) => updateField('role_in_company', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. CEO, HR Director"
              />
            </div>

            <div>
              <label
                htmlFor="client-employee-count"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Employee Count
              </label>
              <input
                id="client-employee-count"
                type="number"
                min={0}
                step={1}
                value={formData.employee_count}
                onChange={(e) => updateField('employee_count', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Number of employees"
              />
            </div>

            <div>
              <label
                htmlFor="client-expectations"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Expectations
              </label>
              <textarea
                id="client-expectations"
                value={formData.expectations}
                onChange={(e) => updateField('expectations', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Goals, priorities, or notes about what they expect"
              />
            </div>

            <div>
              <label
                htmlFor="client-status"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Pipeline Stage *
              </label>
              <select
                id="client-status"
                value={formData.status}
                onChange={(e) => updateField('status', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {CLIENT_STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting ? 'Creating...' : 'Add Client'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
