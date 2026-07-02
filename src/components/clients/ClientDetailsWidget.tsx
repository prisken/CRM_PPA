'use client';

import { memo, useState } from 'react';
import ClientDetailsEditModal from '@/components/clients/ClientDetailsEditModal';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';

export type ImportantDate = {
  label: string;
  date: string;
};

type ClientDetailsWidgetProps = {
  clientId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  leadSource: string | null;
  roleInCompany: string | null;
  employeeCount: number | null;
  expectations: string | null;
  importantDates: ImportantDate[];
  isSuperAdmin?: boolean;
  isRelationshipSpecialist?: boolean;
  onMutationSuccess?: () => void;
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

function formatImportantDate(date: string) {
  if (!date) {
    return '—';
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function normalizeImportantDates(dates: ImportantDate[]) {
  return dates.filter(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry.label?.trim() || entry.date?.trim())
  );
}

export default memo(function ClientDetailsWidget({
  clientId,
  name,
  company,
  email,
  phone,
  leadSource,
  roleInCompany,
  employeeCount,
  expectations,
  importantDates,
  isSuperAdmin = false,
  isRelationshipSpecialist = false,
  onMutationSuccess,
}: ClientDetailsWidgetProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const displayDates = normalizeImportantDates(importantDates);
  const canEditDetails = isSuperAdmin || isRelationshipSpecialist;

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">Client Details</h3>
          {canEditDetails && (
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
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Lead Source
            </dt>
            <dd className="mt-1">
              {leadSource?.trim() ? (
                <LeadSourceBadges sources={[leadSource]} />
              ) : (
                <span className="text-sm font-medium text-gray-900">—</span>
              )}
            </dd>
          </div>
          <DetailField label="Role in Company" value={roleInCompany ?? '—'} />
          <DetailField
            label="Employee Count"
            value={employeeCount !== null ? String(employeeCount) : '—'}
          />
        </dl>

        <div className="mt-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Expectations
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
            {expectations?.trim() ? expectations : '—'}
          </dd>
        </div>

        <div className="mt-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Important Dates
          </dt>
          {displayDates.length === 0 ? (
            <dd className="mt-1 text-sm text-gray-900">—</dd>
          ) : (
            <ul className="mt-2 space-y-1">
              {displayDates.map((entry, index) => (
                <li key={`${entry.label}-${entry.date}-${index}`} className="text-sm text-gray-900">
                  {entry.label?.trim() || 'Untitled'}: {formatImportantDate(entry.date)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {isEditModalOpen && (
        <ClientDetailsEditModal
          clientId={clientId}
          initialName={name}
          initialCompany={company}
          initialEmail={email}
          initialPhone={phone}
          initialLeadSource={leadSource}
          initialRoleInCompany={roleInCompany}
          initialEmployeeCount={employeeCount}
          initialExpectations={expectations}
          initialImportantDates={importantDates}
          isOpen
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => onMutationSuccess?.()}
        />
      )}
    </>
  );
});
