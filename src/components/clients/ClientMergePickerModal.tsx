'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { formatClientStage, getStatusBadgeStyles } from '@/lib/clientStages';
import type { Client360CoreData } from '@/lib/client360';
import type { ClientSearchResult } from '@/lib/leadCommandCenter';
import type { DuplicateReviewClient } from '@/lib/leadDuplicates';
import {
  mapClient360CoreToMergeClient,
} from '@/components/clients/clientMergeMappers';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 1;
const MAX_MERGE_CLIENTS = 10;
const EMPTY_ANCHOR_SOURCE_LABELS: string[] = [];

type ClientMergePickerModalProps = {
  open: boolean;
  onClose: () => void;
  anchorClient: Client360CoreData;
  anchorSourceLabels?: string[];
  anchorDealCount?: number;
  onContinue: (clients: DuplicateReviewClient[]) => void;
};

type ClientSearchResponse = {
  clients: ClientSearchResult[];
};

function SelectedClientChip({
  client,
  isAnchor,
  onRemove,
  disabled,
}: {
  client: DuplicateReviewClient;
  isAnchor: boolean;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-gray-900">{client.name}</p>
          {isAnchor && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
              Keep
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeStyles(client.status)}`}
          >
            {formatClientStage(client.status)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {[client.company, client.email, client.phone].filter(Boolean).join(' · ') ||
            'No contact details'}
        </p>
      </div>
      {!isAnchor && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200 active:bg-gray-300 hover:text-gray-800 disabled:opacity-50"
          aria-label={`Remove ${client.name}`}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function ClientMergePickerModal({
  open,
  onClose,
  anchorClient,
  anchorSourceLabels = EMPTY_ANCHOR_SOURCE_LABELS,
  anchorDealCount = 0,
  onContinue,
}: ClientMergePickerModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingClientId, setAddingClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedClients, setSelectedClients] = useState<DuplicateReviewClient[]>([]);

  const anchorClientId = anchorClient.client_id;
  const selectedIds = useMemo(
    () => new Set(selectedClients.map((client) => client.clientId)),
    [selectedClients]
  );
  const slotsRemaining = MAX_MERGE_CLIENTS - selectedClients.length;
  const canContinue = selectedClients.length >= 2;

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    if (wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = true;
    setQuery('');
    setResults([]);
    setError(null);
    setLoading(false);
    setAddingClientId(null);
    setSelectedClients([
      mapClient360CoreToMergeClient(anchorClient, {
        sourceLabels: anchorSourceLabels,
        dealCount: anchorDealCount,
      }),
    ]);
  }, [open, anchorClient, anchorClientId, anchorDealCount, anchorSourceLabels]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !addingClientId) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, addingClientId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(
          `/api/search/clients?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Failed to search clients'
          );
        }

        const data = (await response.json()) as ClientSearchResponse;
        setResults(Array.isArray(data.clients) ? data.clients : []);
      } catch (searchError) {
        if (controller.signal.aborted) {
          return;
        }

        setResults([]);
        setError(
          searchError instanceof Error
            ? searchError.message
            : 'Failed to search clients'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, query]);

  async function handleAddClient(result: ClientSearchResult) {
    if (selectedIds.has(result.clientId) || slotsRemaining <= 0) {
      return;
    }

    setAddingClientId(result.clientId);
    setError(null);

    try {
      const response = await authenticatedFetch(`/api/clients/${result.clientId}`);
      if (!response.ok) {
        throw new Error('Failed to load client details');
      }

      const data = (await response.json()) as Client360CoreData;
      const mergeClient = mapClient360CoreToMergeClient(data, {
        sourceLabels: result.sourceLabels,
      });

      setSelectedClients((current) => {
        if (current.some((client) => client.clientId === mergeClient.clientId)) {
          return current;
        }

        if (current.length >= MAX_MERGE_CLIENTS) {
          return current;
        }

        return [...current, mergeClient];
      });
      setQuery('');
      setResults([]);
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : 'Failed to add client'
      );
    } finally {
      setAddingClientId(null);
    }
  }

  function handleRemoveClient(clientId: string) {
    if (clientId === anchorClientId) {
      return;
    }

    setSelectedClients((current) =>
      current.filter((client) => client.clientId !== clientId)
    );
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-merge-picker-title"
          className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        >
          <div className="overflow-y-auto p-4 sm:p-6">
            <h3
              id="client-merge-picker-title"
              className="text-lg font-semibold text-gray-900"
            >
              Merge clients
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Search for other clients to merge with this record. This client stays
              selected as the default surviving record. Add up to{' '}
              {MAX_MERGE_CLIENTS - 1} more ({slotsRemaining} slot
              {slotsRemaining === 1 ? '' : 's'} left).
            </p>

            <div className="mt-5 space-y-2">
              <p className="text-sm font-medium text-gray-700">
                Selected ({selectedClients.length}/{MAX_MERGE_CLIENTS})
              </p>
              <div className="space-y-2">
                {selectedClients.map((client) => (
                  <SelectedClientChip
                    key={client.clientId}
                    client={client}
                    isAnchor={client.clientId === anchorClientId}
                    onRemove={() => handleRemoveClient(client.clientId)}
                    disabled={Boolean(addingClientId)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label
                htmlFor="client-merge-search"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Search clients
              </label>
              <input
                ref={inputRef}
                id="client-merge-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={slotsRemaining <= 0 || Boolean(addingClientId)}
                placeholder={
                  slotsRemaining <= 0
                    ? 'Maximum clients selected'
                    : 'Search by name, company, email, or phone'
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>

            <div className="mt-3">
              {loading && <p className="text-sm text-gray-500">Searching...</p>}
              {!loading && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && (
                <p className="text-sm text-gray-500">No clients found.</p>
              )}
              {results.length > 0 && (
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                  {results.map((result) => {
                    const alreadySelected = selectedIds.has(result.clientId);
                    const isAnchorResult = result.clientId === anchorClientId;
                    const disabled =
                      alreadySelected ||
                      isAnchorResult ||
                      slotsRemaining <= 0 ||
                      addingClientId !== null;

                    return (
                      <li key={result.clientId}>
                        <button
                          type="button"
                          onClick={() => handleAddClient(result)}
                          disabled={disabled}
                          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">{result.name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {[result.company, result.email, result.phone]
                                .filter(Boolean)
                                .join(' · ') || 'No contact details'}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-medium text-blue-600">
                            {isAnchorResult || alreadySelected
                              ? 'Selected'
                              : addingClientId === result.clientId
                                ? 'Adding...'
                                : 'Add'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {!canContinue && selectedClients.length === 1 && (
              <p className="mt-3 text-sm text-gray-500">
                Add at least one more client to continue.
              </p>
            )}
          </div>

          <div className="border-t border-gray-200 bg-white p-4 sm:px-6">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={Boolean(addingClientId)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onContinue(selectedClients)}
                disabled={!canContinue || Boolean(addingClientId)}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 active:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continue to merge
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ClientMergePickerModal);
