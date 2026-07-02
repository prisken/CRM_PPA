'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
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

export default memo(function ClientSourceRecordsWidget({
  clientId,
}: ClientSourceRecordsWidgetProps) {
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [clientId]);

  const uniqueSourceLabels = useMemo(
    () => [...new Set(records.map((record) => formatSourceLabel(record.source)))],
    [records]
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">External Source Records</h3>
          <p className="mt-1 text-xs text-gray-500">
            Inbound submissions from connected integrations.
          </p>
        </div>
        {!isLoading && !error && records.length > 0 && (
          <LeadSourceBadges sources={uniqueSourceLabels} />
        )}
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading source records…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : records.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No external source records yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {records.map((record) => (
            <li
              key={record.id}
              className="rounded-lg border border-gray-100 bg-gray-50 p-3"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm font-medium text-gray-900">
                  {formatSourceLabel(record.source)}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(record.receivedAt)}
                </p>
              </div>

              <dl className="mt-2 space-y-1 text-xs text-gray-600">
                {record.externalId ? (
                  <div>
                    <dt className="inline font-medium text-gray-500">External ID: </dt>
                    <dd className="inline break-all text-gray-800">
                      {record.externalId}
                    </dd>
                  </div>
                ) : null}
                {record.normalizedEmail ? (
                  <div>
                    <dt className="inline font-medium text-gray-500">Email: </dt>
                    <dd className="inline break-all text-gray-800">
                      {record.normalizedEmail}
                    </dd>
                  </div>
                ) : null}
                {record.normalizedPhone ? (
                  <div>
                    <dt className="inline font-medium text-gray-500">Phone: </dt>
                    <dd className="inline break-all text-gray-800">
                      {record.normalizedPhone}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <details className="mt-2">
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
      )}
    </div>
  );
});
