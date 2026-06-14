'use client';

import { useState } from 'react';
import ClientDetailsEditModal from '@/components/clients/ClientDetailsEditModal';

type ClientDetailsWidgetProps = {
  clientId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  leadSource: string | null;
  canEdit?: boolean;
  onSaved?: () => void;
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

export default function ClientDetailsWidget({
  clientId,
  name,
  company,
  email,
  phone,
  leadSource,
  canEdit = false,
  onSaved,
}: ClientDetailsWidgetProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">Client Details</h3>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Name" value={name} />
          <DetailField label="Company" value={company ?? '—'} />
          <DetailField label="Email" value={email ?? '—'} />
          <DetailField label="Phone" value={phone ?? '—'} />
          <DetailField label="Lead Source" value={leadSource ?? '—'} />
        </dl>
      </div>

      <ClientDetailsEditModal
        clientId={clientId}
        initialName={name}
        initialCompany={company}
        initialEmail={email}
        initialPhone={phone}
        initialLeadSource={leadSource}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={() => onSaved?.()}
      />
    </>
  );
}
