'use client';

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { useMemo, useState } from 'react';
import type { ImportantDate } from '@/components/clients/ClientDetailsWidget';
import { LEAD_SOURCE_SUGGESTIONS } from '@/lib/leadSources';

type ClientDetailsEditModalProps = {
  clientId: string;
  initialName: string;
  initialCompany: string | null;
  initialEmail: string | null;
  initialPhone: string | null;
  initialLeadSource: string | null;
  initialRoleInCompany: string | null;
  initialEmployeeCount: number | null;
  initialExpectations: string | null;
  initialImportantDates: ImportantDate[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function normalizeImportantDates(dates: ImportantDate[]) {
  if (!Array.isArray(dates)) {
    return [];
  }

  return dates.map((entry) => ({
    label: typeof entry?.label === 'string' ? entry.label : '',
    date: typeof entry?.date === 'string' ? entry.date : '',
  }));
}

export default function ClientDetailsEditModal({
  clientId,
  initialName,
  initialCompany,
  initialEmail,
  initialPhone,
  initialLeadSource,
  initialRoleInCompany,
  initialEmployeeCount,
  initialExpectations,
  initialImportantDates,
  isOpen,
  onClose,
  onSaved,
}: ClientDetailsEditModalProps) {
  const formKey = isOpen
    ? [
        clientId,
        initialName,
        initialCompany,
        initialEmail,
        initialPhone,
        initialLeadSource,
        initialRoleInCompany,
        initialEmployeeCount,
        initialExpectations,
        JSON.stringify(initialImportantDates),
      ].join('|')
    : 'closed';

  return (
    <ClientDetailsEditModalForm
      key={formKey}
      clientId={clientId}
      initialName={initialName}
      initialCompany={initialCompany}
      initialEmail={initialEmail}
      initialPhone={initialPhone}
      initialLeadSource={initialLeadSource}
      initialRoleInCompany={initialRoleInCompany}
      initialEmployeeCount={initialEmployeeCount}
      initialExpectations={initialExpectations}
      initialImportantDates={initialImportantDates}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function ClientDetailsEditModalForm({
  clientId,
  initialName,
  initialCompany,
  initialEmail,
  initialPhone,
  initialLeadSource,
  initialRoleInCompany,
  initialEmployeeCount,
  initialExpectations,
  initialImportantDates,
  isOpen,
  onClose,
  onSaved,
}: ClientDetailsEditModalProps) {
  const [name, setName] = useState(initialName);
  const [company, setCompany] = useState(initialCompany ?? '');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [leadSource, setLeadSource] = useState(initialLeadSource ?? '');
  const [leadSourceQuery, setLeadSourceQuery] = useState(initialLeadSource ?? '');
  const [roleInCompany, setRoleInCompany] = useState(initialRoleInCompany ?? '');
  const [employeeCount, setEmployeeCount] = useState(
    initialEmployeeCount !== null ? String(initialEmployeeCount) : ''
  );
  const [expectations, setExpectations] = useState(initialExpectations ?? '');
  const [importantDates, setImportantDates] = useState<ImportantDate[]>(
    normalizeImportantDates(initialImportantDates)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredLeadSources = useMemo(() => {
    if (leadSourceQuery.trim() === '') {
      return LEAD_SOURCE_SUGGESTIONS;
    }

    return LEAD_SOURCE_SUGGESTIONS.filter((source) =>
      source.toLowerCase().includes(leadSourceQuery.toLowerCase())
    );
  }, [leadSourceQuery]);

  if (!isOpen) {
    return null;
  }

  function addImportantDate() {
    setImportantDates((current) => [...current, { label: '', date: '' }]);
  }

  function removeImportantDate(index: number) {
    setImportantDates((current) => current.filter((_, i) => i !== index));
  }

  function updateImportantDate(index: number, field: keyof ImportantDate, value: string) {
    setImportantDates((current) =>
      current.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const cleanedImportantDates = importantDates
      .filter((entry) => entry.label.trim() || entry.date.trim())
      .map((entry) => ({
        label: entry.label.trim(),
        date: entry.date.trim(),
      }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/clients/${clientId}/details`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          lead_source: leadSourceQuery.trim() || null,
          roleInCompany: roleInCompany.trim() || null,
          employeeCount: employeeCount.trim() ? Number(employeeCount) : null,
          expectations: expectations.trim() || null,
          importantDates: cleanedImportantDates,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : `Failed to update client details (${res.status})`
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update client details');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Edit Client Details</h3>
        <p className="mt-1 text-sm text-gray-500">
          Update the client&apos;s contact information and profile details.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="client-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Name
            </label>
            <input
              id="client-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Lead Source
            </label>
            <Combobox
              value={leadSource}
              onChange={(value) => {
                const nextValue = value ?? '';
                setLeadSource(nextValue);
                setLeadSourceQuery(nextValue);
              }}
            >
              <ComboboxInput
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                displayValue={() => leadSourceQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setLeadSourceQuery(value);
                  setLeadSource(value);
                }}
                placeholder="Select or type a lead source"
              />
              <ComboboxOptions className="mt-1 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg empty:invisible">
                {filteredLeadSources.map((source) => (
                  <ComboboxOption
                    key={source}
                    value={source}
                    className="cursor-pointer px-3 py-2 text-sm text-gray-900 data-focus:bg-blue-50 data-focus:text-blue-700"
                  >
                    {source}
                  </ComboboxOption>
                ))}
              </ComboboxOptions>
            </Combobox>
          </div>

          <div>
            <label
              htmlFor="client-role"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Role in Company
            </label>
            <input
              id="client-role"
              type="text"
              value={roleInCompany}
              onChange={(event) => setRoleInCompany(event.target.value)}
              placeholder="e.g. CEO, Founder"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
              value={employeeCount}
              onChange={(event) => setEmployeeCount(event.target.value)}
              placeholder="e.g. 50"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
              value={expectations}
              onChange={(event) => setExpectations(event.target.value)}
              rows={4}
              placeholder="What does the client expect from this engagement?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Important Dates
              </label>
              <button
                type="button"
                onClick={addImportantDate}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                + Add date
              </button>
            </div>

            {importantDates.length === 0 ? (
              <p className="text-sm text-gray-500">No important dates added yet.</p>
            ) : (
              <div className="space-y-3">
                {importantDates.map((entry, index) => (
                  <div
                    key={`important-date-${index}`}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Label
                        </label>
                        <input
                          type="text"
                          value={entry.label}
                          onChange={(event) =>
                            updateImportantDate(index, 'label', event.target.value)
                          }
                          placeholder="e.g. Contract renewal"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Date
                        </label>
                        <input
                          type="date"
                          value={entry.date}
                          onChange={(event) =>
                            updateImportantDate(index, 'date', event.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImportantDate(index)}
                      className="mt-2 text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
