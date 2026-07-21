'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import { useClient360RefreshOptional } from '@/components/clients/client360Refresh';
import SectionCard from '@/components/ui/SectionCard';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getTightStackSpacingClass } from '@/components/ui/displayDensity';
import {
  applySourceRecordsCollapsedChange,
  shouldFetchClient360SourceRecords,
} from '@/lib/client360LoadGuards';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type SourceRecord = {
  id: string;
  source: string;
  externalId: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  receivedAt: string;
  createdAt: string;
  payload: unknown;
};

type ClientSourceRecordsWidgetProps = {
  clientId: string;
};

const SOURCE_LABELS: Record<string, string> = {
  GOOGLE_FORMS: 'Google Forms',
  PROFIT_PULSE_ALLY: 'Profit Pulse Ally',
  MANUAL: 'Manual',
  OTHER: 'Other',
};

function formatSourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ');
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPayload(payload: unknown) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

/**
 * Phase 2L/2M: defaultCollapsed card — defer GET /source-records until first expand
 * (and on later sourceRecords slice refreshes after expand).
 * Policy: {@link shouldFetchClient360SourceRecords} / {@link applySourceRecordsCollapsedChange}.
 */
export default memo(function ClientSourceRecordsWidget({
  clientId,
}: ClientSourceRecordsWidgetProps) {
  const { density } = useDisplayDensity();
  const recordListSpacingClass = getTightStackSpacingClass(density);
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [hasExpanded, setHasExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const client360Refresh = useClient360RefreshOptional();
  const sourceRecordsSliceKey =
    client360Refresh?.sliceKeys.sourceRecords ?? 0;

  useEffect(() => {
    if (!shouldFetchClient360SourceRecords({ hasExpanded })) {
      return;
    }

    let cancelled = false;

    async function loadSourceRecords() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(
          `/api/clients/${clientId}/source-records`
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body.error === 'string'
              ? body.error
              : 'Failed to load source records'
          );
        }

        const body = (await response.json()) as { sourceRecords?: SourceRecord[] };

        if (!cancelled) {
          setRecords(body.sourceRecords ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load source records'
          );
          setRecords([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSourceRecords();

    return () => {
      cancelled = true;
    };
  }, [clientId, hasExpanded, sourceRecordsSliceKey]);

  const uniqueSourceLabels = useMemo(
    () => [...new Set(records.map((record) => formatSourceLabel(record.source)))],
    [records]
  );

  const latestReceivedAt = useMemo(() => {
    if (records.length === 0) {
      return null;
    }

    return records.reduce((latest, record) => {
      const latestTime = new Date(latest).getTime();
      const recordTime = new Date(record.receivedAt).getTime();
      return recordTime > latestTime ? record.receivedAt : latest;
    }, records[0].receivedAt);
  }, [records]);

  const collapsedSummary = useMemo(() => {
    if (!hasExpanded) {
      return 'Expand to view external ingest history.';
    }

    if (isLoading) {
      return 'Loading source records…';
    }

    if (error) {
      return error;
    }

    if (records.length === 0) {
      return 'No external source records yet.';
    }

    return (
      <div className="space-y-1.5">
        <LeadSourceBadges sources={uniqueSourceLabels} maxVisible={2} />
        {latestReceivedAt && (
          <p className="text-xs text-gray-500">
            Latest received: {formatDateTime(latestReceivedAt)}
          </p>
        )}
      </div>
    );
  }, [
    error,
    hasExpanded,
    isLoading,
    latestReceivedAt,
    records.length,
    uniqueSourceLabels,
  ]);

  const visibleRecords = showAllRecords ? records : records.slice(0, 3);
  const hiddenRecordCount = Math.max(records.length - visibleRecords.length, 0);

  return (
    <SectionCard
      title="External Source Records"
      description={collapsedSummary}
      collapsible
      defaultCollapsed
      onCollapsedChange={(collapsed) => {
        setHasExpanded((current) =>
          applySourceRecordsCollapsedChange({
            collapsed,
            hasExpanded: current,
          }).hasExpanded
        );
      }}
      className="shadow-sm"
    >
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading source records…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-gray-500">No external source records yet.</p>
      ) : (
        <>
          <ul className={recordListSpacingClass}>
            {visibleRecords.map((record) => (
              <li
                key={record.id}
                className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {formatSourceLabel(record.source)}
                  </p>
                  <p className="shrink-0 text-xs text-gray-500">
                    {formatDateTime(record.receivedAt)}
                  </p>
                </div>

                <dl className="mt-1.5 space-y-0.5 text-xs text-gray-600">
                  {record.externalId ? (
                    <div className="min-w-0">
                      <dt className="inline font-medium text-gray-500">External ID: </dt>
                      <dd className="inline truncate text-gray-800" title={record.externalId}>
                        {record.externalId}
                      </dd>
                    </div>
                  ) : null}
                  {record.normalizedEmail ? (
                    <div className="min-w-0">
                      <dt className="inline font-medium text-gray-500">Email: </dt>
                      <dd className="inline truncate text-gray-800" title={record.normalizedEmail}>
                        {record.normalizedEmail}
                      </dd>
                    </div>
                  ) : null}
                  {record.normalizedPhone ? (
                    <div className="min-w-0">
                      <dt className="inline font-medium text-gray-500">Phone: </dt>
                      <dd className="inline truncate text-gray-800" title={record.normalizedPhone}>
                        {record.normalizedPhone}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700">
                    View payload
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-white p-2 text-[11px] leading-relaxed text-gray-800">
                    {formatPayload(record.payload)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
          {hiddenRecordCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllRecords((current) => !current)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {showAllRecords
                ? 'Show fewer records'
                : `Show ${hiddenRecordCount} more record${hiddenRecordCount === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      )}
    </SectionCard>
  );
});
