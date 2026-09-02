'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import MultiValueTextField from '@/components/ui/MultiValueTextField';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type AddLeadModalProps = {
  onClose: () => void;
  onCreated: () => void;
};

const initialFormData = {
  name: '',
  company: '',
  emails: [''],
  phones: [''],
  lead_source: '',
  role_in_company: '',
  employee_count: '',
  expectations: '',
  status: 'NEW_LEAD',
};

export default function AddLeadModal({ onClose, onCreated }: AddLeadModalProps) {
  const router = useRouter();
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: 'name' | 'company' | 'lead_source' | 'role_in_company' | 'employee_count' | 'expectations' | 'status', value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await authenticatedFetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          company: formData.company,
          emails: formData.emails.map((v) => v.trim()).filter(Boolean),
          phones: formData.phones.map((v) => v.trim()).filter(Boolean),
          lead_source: formData.lead_source,
          role_in_company: formData.role_in_company,
          employee_count: formData.employee_count,
          expectations: formData.expectations,
          status: formData.status,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to create lead'
        );
      }

      const client = await res.json();
      onCreated();
      onClose();
      router.push(`/clients/${client.client_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">Add Lead</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a new lead. You will be assigned as the Relationship Officer.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="lead-name"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Name *
              </label>
              <input
                id="lead-name"
                type="text"
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                placeholder="Lead or contact name"
              />
            </div>

            <div>
              <label
                htmlFor="lead-company"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Company
              </label>
              <input
                id="lead-company"
                type="text"
                value={formData.company}
                onChange={(event) => updateField('company', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                placeholder="Company name"
              />
            </div>

            <MultiValueTextField
              id="lead-email"
              label="Email"
              type="email"
              values={formData.emails}
              onChange={(emails) => setFormData((c) => ({ ...c, emails }))}
              addLabel="Add email"
              placeholder="you@example.com"
            />

            <MultiValueTextField
              id="lead-phone"
              label="Phone"
              type="tel"
              values={formData.phones}
              onChange={(phones) => setFormData((c) => ({ ...c, phones }))}
              addLabel="Add phone"
              placeholder="Phone number"
            />


            <div>
              <label
                htmlFor="lead-source"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Lead Source
              </label>
              <input
                id="lead-source"
                type="text"
                value={formData.lead_source}
                onChange={(event) => updateField('lead_source', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                placeholder="e.g. Referral, Paid Ads"
              />
            </div>

            <div>
              <label
                htmlFor="lead-role-in-company"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Role in Company
              </label>
              <input
                id="lead-role-in-company"
                type="text"
                value={formData.role_in_company}
                onChange={(event) =>
                  updateField('role_in_company', event.target.value)
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                placeholder="e.g. CEO, HR Director"
              />
            </div>

            <div>
              <label
                htmlFor="lead-employee-count"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Employee Count
              </label>
              <input
                id="lead-employee-count"
                type="number"
                min={0}
                step={1}
                value={formData.employee_count}
                onChange={(event) =>
                  updateField('employee_count', event.target.value)
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                placeholder="Number of employees"
              />
            </div>

            <div>
              <label
                htmlFor="lead-expectations"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Expectations
              </label>
              <textarea
                id="lead-expectations"
                value={formData.expectations}
                onChange={(event) => updateField('expectations', event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                placeholder="Goals, priorities, or notes about what they expect"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
              >
                {isSubmitting ? 'Creating...' : 'Add Lead'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
