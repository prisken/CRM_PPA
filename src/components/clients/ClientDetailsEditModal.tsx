'use client';

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { useEffect, useMemo, useState } from 'react';
import { LEAD_SOURCE_SUGGESTIONS } from '@/lib/leadSources';

type ClientDetailsEditModalProps = {
  clientId: string;
  initialName: string;
  initialCompany: string | null;
  initialEmail: string | null;
  initialPhone: string | null;
  initialLeadSource: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function ClientDetailsEditModal({
  clientId,
  initialName,
  initialCompany,
  initialEmail,
  initialPhone,
  initialLeadSource,
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setName(initialName);
    setCompany(initialCompany ?? '');
    setEmail(initialEmail ?? '');
    setPhone(initialPhone ?? '');
    setLeadSource(initialLeadSource ?? '');
    setLeadSourceQuery(initialLeadSource ?? '');
    setError(null);
  }, [
    isOpen,
    initialName,
    initialCompany,
    initialEmail,
    initialPhone,
    initialLeadSource,
  ]);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          lead_source: leadSourceQuery.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to update client details');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Edit Client Details</h3>
        <p className="mt-1 text-sm text-gray-500">
          Update the client&apos;s core contact information.
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
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
  );
}
