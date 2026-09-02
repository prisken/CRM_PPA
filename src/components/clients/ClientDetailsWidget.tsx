'use client';

import { memo, useCallback, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import ClientDetailsEditModal, {
  type ClientDetailsSavedPayload,
} from '@/components/clients/ClientDetailsEditModal';
import ImportantDatesPanel from '@/components/clients/ImportantDatesPanel';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import {
  useClient360Refresh,
  type Client360RefreshRequest,
} from '@/components/clients/client360Refresh';
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
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
  priority?: string | null;

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
  nextAction,
  nextFollowUpAt,
  priority,
  isSuperAdmin = false,
  isRelationshipSpecialist = false,
}: ClientDetailsWidgetProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingNext, setEditingNext] = useState(false);
  const [nextActionDraft, setNextActionDraft] = useState(nextAction ?? '');
  const [nextFollowUpDraft, setNextFollowUpDraft] = useState(
    nextFollowUpAt ? nextFollowUpAt.slice(0, 10) : ''
  );
  const [savingNext, setSavingNext] = useState(false);
  const { density } = useDisplayDensity();
  const { refreshClient360Slices } = useClient360Refresh();

  const saveNextStep = useCallback(async () => {
    setSavingNext(true);
    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/follow-up`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextAction: nextActionDraft.trim() || null,
          nextFollowUpAt: nextFollowUpDraft || null,
        }),
      });
      if (res.ok) {
        setEditingNext(false);
        refreshClient360Slices(['core', 'importantDates']);
      }
    } finally {
      setSavingNext(false);
    }
  }, [clientId, nextActionDraft, nextFollowUpDraft, refreshClient360Slices]);

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
        {(nextAction || nextFollowUpAt || editingNext) && (
          <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
            {editingNext ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={nextActionDraft}
                  onChange={(e) => setNextActionDraft(e.target.value)}
                  placeholder="Next step…"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                  autoFocus
                />
                <input
                  type="date"
                  value={nextFollowUpDraft}
                  onChange={(e) => setNextFollowUpDraft(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveNextStep}
                    disabled={savingNext}
                    className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingNext ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingNext(false)}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {nextAction ? (
                  <p className="text-sm font-medium text-blue-900">{nextAction}</p>
                ) : null}
                {nextFollowUpAt ? (
                  <p className="mt-0.5 text-xs text-blue-700">
                    Follow up by{' '}
                    {new Date(nextFollowUpAt).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setNextActionDraft(nextAction ?? '');
                    setNextFollowUpDraft(nextFollowUpAt ? nextFollowUpAt.slice(0, 10) : '');
                    setEditingNext(true);
                  }}
                  className="mt-1 text-[11px] font-medium text-blue-600 hover:underline"
                >
                  Update next step
                </button>
              </>
            )}
          </div>
        )}
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
            onChanged={() => {
              // Local panel list already reloaded; bump slice for page core dates sync only.
              refreshClient360Slices(['importantDates']);
            }}
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
          onSaved={(payload: ClientDetailsSavedPayload) => {
            const companyChanged = (payload.company ?? null) !== (company ?? null);
            const employeeCountChanged =
              payload.employeeCount !== employeeCount;
            const slices: Client360RefreshRequest[] = [
              'core',
              'importantDates',
            ];
            if (companyChanged || employeeCountChanged) {
              slices.push('hierarchy');
            }
            // No router.refresh — page client-fetches core; hierarchy widget refetches on key.
            refreshClient360Slices(slices);
          }}
        />
      )}
    </>
  );
});
