'use client';

import { memo, useState } from 'react';
import ClientDetailsEditModal from '@/components/clients/ClientDetailsEditModal';
import ImportantDatesPanel from '@/components/clients/ImportantDatesPanel';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import EmptyMuted from '@/components/ui/EmptyMuted';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getWidgetPaddingClass } from '@/components/ui/displayDensity';

export type ImportantDate = {
  id?: string;
  label: string;
  date: string;
  time?: string | null;
  notes?: string | null;
  scheduledAt?: string;
  hasTime?: boolean;
};

type ClientDetailsWidgetProps = {
  clientId: string;
  /** When true (or status is lead-like), label UI as Lead Details. */
  isLead?: boolean;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  emails?: string[];
  phones?: string[];
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

function MultiContactField({
  label,
  values,
  fallback,
}: {
  label: string;
  values?: string[];
  fallback: string | null;
}) {
  const list =
    Array.isArray(values) && values.length > 0
      ? values
      : fallback?.trim()
        ? [fallback.trim()]
        : [];

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 space-y-1 text-sm font-medium text-gray-900">
        {list.length === 0 ? (
          <span>—</span>
        ) : (
          list.map((value) => (
            <div key={value} className="break-all">
              {value}
            </div>
          ))
        )}
      </dd>
    </div>
  );
}

export default memo(function ClientDetailsWidget({
  clientId,
  isLead = false,
  name,
  company,
  email,
  phone,
  emails,
  phones,
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
  const { density } = useDisplayDensity();
  const widgetPaddingClass = getWidgetPaddingClass(density);
  const canEditDetails = isSuperAdmin || isRelationshipSpecialist;
  const entityLabel = isLead ? 'Lead' : 'Client';
  const hasExtraDetails =
    Boolean(roleInCompany?.trim()) ||
    employeeCount !== null ||
    Boolean(expectations?.trim());

  return (
    <>
      <div
        className={`rounded-xl border border-gray-200 bg-white shadow-sm ${widgetPaddingClass}`}
      >
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {entityLabel} Details
          </h3>
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

        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailField label="Name" value={name} />
          <DetailField label="Company" value={company ?? '—'} />
          <MultiContactField label="Email" values={emails} fallback={email} />
          <MultiContactField label="Phone" values={phones} fallback={phone} />
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Lead Source
            </dt>
            <dd className="mt-1">
              {leadSource?.trim() ? (
                <LeadSourceBadges sources={[leadSource]} maxVisible={2} />
              ) : (
                <EmptyMuted />
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-3 border-t border-gray-100 pt-3">
          <ImportantDatesPanel
            ownerId={clientId}
            ownerKind={isLead ? 'lead' : 'client'}
            canEdit={canEditDetails}
            initialDates={importantDates}
          />
        </div>

        {hasExtraDetails && (
          <details className="mt-3 border-t border-gray-100 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700">
              More details
            </summary>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <DetailField
                label="Role in Company"
                value={roleInCompany ?? '—'}
              />
              <DetailField
                label="Employee Count"
                value={employeeCount !== null ? String(employeeCount) : '—'}
              />
            </dl>

            <div className="mt-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Expectations
              </dt>
              <dd className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-gray-900">
                {expectations?.trim() ? expectations : '—'}
              </dd>
            </div>
          </details>
        )}
      </div>

      {isEditModalOpen && (
        <ClientDetailsEditModal
          clientId={clientId}
          isLead={isLead}
          initialName={name}
          initialCompany={company}
          initialEmail={email}
          initialPhone={phone}
          initialEmails={emails}
          initialPhones={phones}
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
