'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { formatClientStage, getStatusBadgeStyles } from '@/lib/clientStages';
import type { ClientSearchResult } from '@/lib/leadCommandCenter';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 1;

type ClientSearchResponse = {
  clients: ClientSearchResult[];
};

function isCommandPaletteRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/clients/') ||
    pathname === '/my-statements'
  );
}

function AttentionScoreBadge({ score }: { score: number }) {
  if (score <= 0) {
    return null;
  }

  const tone =
    score >= 80
      ? 'bg-red-100 text-red-800'
      : score >= 40
        ? 'bg-orange-100 text-orange-800'
        : 'bg-amber-100 text-amber-800';

  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
    >
      {score}
    </span>
  );
}

function AttentionReasonBadges({
  reasons,
  maxVisible = 2,
}: {
  reasons: string[];
  maxVisible?: number;
}) {
  if (reasons.length === 0) {
    return null;
  }

  const visible = reasons.slice(0, maxVisible);
  const hiddenCount = reasons.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((reason) => (
        <span
          key={reason}
          className="inline-flex max-w-full truncate rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
          title={reason}
        >
          {reason}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

function SearchResultRow({
  client,
  isActive,
  id,
  onSelect,
  onHover,
}: {
  client: ClientSearchResult;
  isActive: boolean;
  id: string;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <li id={id} role="option" aria-selected={isActive}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={onHover}
        className={`flex w-full flex-col gap-2 rounded-lg px-3 py-3 text-left transition sm:px-4 ${
          isActive ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {client.name}
            </p>
            {client.company && (
              <p className="mt-0.5 truncate text-sm text-gray-500">
                {client.company}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AttentionScoreBadge score={client.attentionScore} />
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadgeStyles(client.status)}`}
            >
              {formatClientStage(client.status)}
            </span>
          </div>
        </div>

        {(client.email || client.phone) && (
          <p className="truncate text-xs text-gray-500">
            {[client.email, client.phone].filter(Boolean).join(' · ')}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <LeadSourceBadges sources={client.sourceLabels} maxVisible={2} />
          <AttentionReasonBadges reasons={client.attentionReasons} />
        </div>
      </button>
    </li>
  );
}

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const listboxId = useId();
  const inputId = useId();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const enabled = mounted && isCommandPaletteRoute(pathname);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setError(null);
    setActiveIndex(0);
    setLoading(false);
  }, []);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setResults([]);
    setError(null);
    setActiveIndex(0);
  }, []);

  const navigateToClient = useCallback(
    (clientId: string) => {
      closePalette();
      router.push(`/clients/${clientId}`);
    },
    [closePalette, router]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      closePalette();
    }
  }, [enabled, closePalette]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const isModifierShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';

      if (isModifierShortcut) {
        event.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }

      if (!open) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePalette();
        return;
      }

      if (results.length === 0) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % results.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) =>
          current === 0 ? results.length - 1 : current - 1
        );
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = results[activeIndex];
        if (selected) {
          navigateToClient(selected.clientId);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    open,
    closePalette,
    openPalette,
    results,
    activeIndex,
    navigateToClient,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      setLoading(false);
      setActiveIndex(0);
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
            typeof data.error === 'string'
              ? data.error
              : 'Failed to search clients'
          );
        }

        const data = (await response.json()) as ClientSearchResponse;
        const clients = Array.isArray(data.clients) ? data.clients : [];
        setResults(clients);
        setActiveIndex(0);
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

  if (!enabled) {
    return null;
  }

  if (!open) {
    return null;
  }

  const activeOptionId =
    results.length > 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0"
        onClick={closePalette}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(100dvh-1.5rem,32rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="border-b border-gray-200 px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-base font-semibold text-gray-900">
              Search clients
            </h2>
            <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500 sm:inline">
              Esc
            </kbd>
          </div>

          <div className="relative mt-3">
            <label htmlFor={inputId} className="sr-only">
              Search clients by name, company, email, or phone
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, company, email, or phone..."
              autoComplete="off"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:text-sm"
            />
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Open anywhere with{' '}
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-medium">
              ⌘K
            </kbd>{' '}
            or{' '}
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-medium">
              Ctrl+K
            </kbd>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
          {loading && (
            <p className="px-3 py-6 text-center text-sm text-gray-500" role="status">
              Searching...
            </p>
          )}

          {!loading && error && (
            <p className="px-3 py-6 text-center text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && query.trim().length < MIN_QUERY_LENGTH && (
            <p className="px-3 py-6 text-center text-sm text-gray-500">
              Type to search clients.
            </p>
          )}

          {!loading &&
            !error &&
            query.trim().length >= MIN_QUERY_LENGTH &&
            results.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-500">
                No clients found.
              </p>
            )}

          {!loading && !error && results.length > 0 && (
            <ul id={listboxId} role="listbox" aria-label="Client search results">
              {results.map((client, index) => (
                <SearchResultRow
                  key={client.clientId}
                  id={`${listboxId}-option-${index}`}
                  client={client}
                  isActive={index === activeIndex}
                  onSelect={() => navigateToClient(client.clientId)}
                  onHover={() => setActiveIndex(index)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
