'use client';

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AddImportantDateFromCalendarModal from '@/components/dashboard/AddImportantDateFromCalendarModal';
import { formatImportantTimeOnly } from '@/components/clients/importantDateDisplay';
import ImportantDateEventDetailModal from '@/components/dashboard/ImportantDateEventDetailModal';
import ImportantDatesCalendarWidgetSkeleton from '@/components/dashboard/skeletons/ImportantDatesCalendarWidgetSkeleton';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getWidgetPaddingClass } from '@/components/ui/displayDensity';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type {
  CalendarRecordTypeFilter,
  ImportantDatesCalendarEvent,
} from '@/lib/importantDatesCalendar';

type AdminUserOption = {
  user_id: string;
  userName: string;
  email: string;
  role: string;
  status: string;
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toLocalYmd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getMonthMeta(year: number, monthIndex: number) {
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay(); // 0 = Sunday
  const lastWeekday = new Date(year, monthIndex, daysInMonth).getDay();

  const gridStart = new Date(year, monthIndex, 1 - firstWeekday);
  const gridEnd = new Date(year, monthIndex, daysInMonth + (6 - lastWeekday));

  return {
    monthLabel,
    startDate: toLocalYmd(gridStart),
    endDate: toLocalYmd(gridEnd),
    gridStart,
    gridEnd,
    daysInMonth,
  };
}

type CalendarCell = {
  key: string;
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

function buildMonthCells(year: number, monthIndex: number): CalendarCell[] {
  const { gridStart, gridEnd } = getMonthMeta(year, monthIndex);
  const todayKey = toLocalYmd(new Date());
  const cells: CalendarCell[] = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    const dateKey = toLocalYmd(cursor);
    cells.push({
      key: dateKey,
      dateKey,
      dayNumber: cursor.getDate(),
      inCurrentMonth: cursor.getMonth() === monthIndex,
      isToday: dateKey === todayKey,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
}

const WEEKDAY_LABELS = [
  { short: 'S', long: 'Sun' },
  { short: 'M', long: 'Mon' },
  { short: 'T', long: 'Tue' },
  { short: 'W', long: 'Wed' },
  { short: 'T', long: 'Thu' },
  { short: 'F', long: 'Fri' },
  { short: 'S', long: 'Sat' },
] as const;
const MAX_VISIBLE_EVENTS_DESKTOP = 3;
const MAX_VISIBLE_EVENTS_MOBILE = 2;

type CalendarApiResponse = {
  events: ImportantDatesCalendarEvent[];
};

type ImportantDatesCalendarWidgetProps = {
  refreshKey?: number;
};

function EventChip({
  event,
  onSelect,
}: {
  event: ImportantDatesCalendarEvent;
  onSelect: (event: ImportantDatesCalendarEvent) => void;
}) {
  const timeLabel = event.time ? formatImportantTimeOnly(event.time) : null;
  const isClient = event.recordType === 'CLIENT';
  const title = event.title || event.label;

  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onSelect(event);
      }}
      className={`w-full rounded px-1 py-0.5 text-left leading-tight transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isClient
          ? 'bg-blue-50 text-blue-900'
          : 'bg-amber-50 text-amber-900'
      }`}
      title={`${title} · ${event.recordName}${
        timeLabel ? ` · ${timeLabel}` : ' · No time set'
      }`}
    >
      <div className="flex items-start gap-1">
        <span
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
            isClient ? 'bg-blue-500' : 'bg-amber-500'
          }`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          {timeLabel ? (
            <span className="block text-[10px] font-semibold tabular-nums opacity-90 sm:text-[11px]">
              {timeLabel}
            </span>
          ) : null}
          <span className="block truncate text-[10px] font-medium sm:text-[11px]">
            {title}
          </span>
        </span>
      </div>
    </button>
  );
}

export default function ImportantDatesCalendarWidget({
  refreshKey = 0,
}: ImportantDatesCalendarWidgetProps) {
  const { density } = useDisplayDensity();
  const widgetPaddingClass = getWidgetPaddingClass(density);
  const { profile } = useUserProfile();
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [events, setEvents] = useState<ImportantDatesCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] =
    useState<ImportantDatesCalendarEvent | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [hasRelationshipRole, setHasRelationshipRole] = useState(false);
  const canCreateImportantDates = Boolean(isSuperAdmin || hasRelationshipRole);

  const [recordType, setRecordType] =
    useState<CalendarRecordTypeFilter>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUserOption[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);

  useEffect(() => {
    if (isSuperAdmin || !profile) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) {
        return;
      }
      try {
        const response = await authenticatedFetch('/api/me/assignments');
        if (!response.ok) {
          throw new Error('Failed to load assignments');
        }
        const data = await response.json();
        if (!cancelled) {
          setHasRelationshipRole(Boolean(data.hasRelationshipRole));
        }
      } catch {
        if (!cancelled) {
          setHasRelationshipRole(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, profile]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) {
        return;
      }
      setAdminUsersLoading(true);
      try {
        const response = await authenticatedFetch('/api/admin/users');
        if (!response.ok) {
          throw new Error('Failed to load users');
        }
        const data = (await response.json()) as AdminUserOption[];
        if (!cancelled) {
          setAdminUsers(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setAdminUsers([]);
        }
      } finally {
        if (!cancelled) {
          setAdminUsersLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  // Clear assigned-user filter when leaving super-admin view
  useEffect(() => {
    if (isSuperAdmin) {
      return;
    }
    void Promise.resolve().then(() => {
      setAssignedUserId('');
      setAdminUsers([]);
    });
  }, [isSuperAdmin]);

  const activeAdminUsers = useMemo(
    () =>
      adminUsers
        .filter((user) => user.status === 'ACTIVE')
        .sort((left, right) => left.userName.localeCompare(right.userName)),
    [adminUsers]
  );

  const monthMeta = useMemo(
    () => getMonthMeta(year, monthIndex),
    [year, monthIndex]
  );
  const cells = useMemo(
    () => buildMonthCells(year, monthIndex),
    [year, monthIndex]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ImportantDatesCalendarEvent[]>();
    for (const event of events) {
      // Calendar day key is the stored wall date (YYYY-MM-DD), never local Date().
      const key = event.date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        continue;
      }
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (Boolean(a.time) !== Boolean(b.time)) {
          return a.time ? -1 : 1;
        }
        return (
          (a.time ?? '').localeCompare(b.time ?? '') ||
          a.label.localeCompare(b.label)
        );
      });
    }
    return map;
  }, [events]);

  function goToPreviousMonth() {
    setExpandedDayKey(null);
    setMonthIndex((current) => {
      if (current === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return current - 1;
    });
  }

  function goToNextMonth() {
    setExpandedDayKey(null);
    setMonthIndex((current) => {
      if (current === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return current + 1;
    });
  }

  function goToCurrentMonth() {
    const today = new Date();
    setExpandedDayKey(null);
    setYear(today.getFullYear());
    setMonthIndex(today.getMonth());
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          startDate: monthMeta.startDate,
          endDate: monthMeta.endDate,
          recordType,
        });
        if (debouncedSearch) {
          params.set('search', debouncedSearch);
        }
        if (isSuperAdmin && assignedUserId) {
          params.set('assignedUserId', assignedUserId);
        }

        const response = await authenticatedFetch(
          `/api/dashboard/widgets/important-dates-calendar?${params.toString()}`
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Failed to load important dates'
          );
        }

        const data = (await response.json()) as CalendarApiResponse;
        if (!cancelled) {
          setEvents(Array.isArray(data.events) ? data.events : []);
          setHasLoadedOnce(true);
        }
      } catch (err) {
        if (!cancelled) {
          setEvents([]);
          setError(
            err instanceof Error ? err.message : 'Failed to load important dates'
          );
          setHasLoadedOnce(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    monthMeta.startDate,
    monthMeta.endDate,
    recordType,
    debouncedSearch,
    isSuperAdmin,
    assignedUserId,
    refreshKey,
    retryToken,
  ]);

  const isCurrentMonth =
    year === now.getFullYear() && monthIndex === now.getMonth();

  const hasActiveFilters =
    recordType !== 'ALL' ||
    Boolean(debouncedSearch) ||
    (isSuperAdmin && Boolean(assignedUserId));

  function clearFilters() {
    setRecordType('ALL');
    setSearchInput('');
    setDebouncedSearch('');
    setAssignedUserId('');
  }

  const monthPrefix = `${year}-${pad2(monthIndex + 1)}`;
  const eventsInViewedMonth = useMemo(
    () => events.filter((event) => event.date.startsWith(monthPrefix)),
    [events, monthPrefix]
  );
  const isEmptyMonth =
    !loading && !error && eventsInViewedMonth.length === 0;

  // First load: full skeleton. Later refetches keep the calendar chrome visible.
  if (!hasLoadedOnce && loading) {
    return <ImportantDatesCalendarWidgetSkeleton />;
  }

  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${widgetPaddingClass}`}
      aria-busy={loading}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">
            Important Dates Calendar
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            View scheduled important dates for clients and leads.
          </p>
          {canCreateImportantDates ? (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              disabled={loading && !hasLoadedOnce}
              className="mt-2 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              + Add Important Date
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1 self-start">
          <button
            type="button"
            onClick={goToPreviousMonth}
            disabled={loading}
            className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[7.5rem] text-center sm:min-w-[8.5rem]">
            <p className="text-sm font-semibold text-gray-900">
              {monthMeta.monthLabel}
            </p>
            {!isCurrentMonth ? (
              <button
                type="button"
                onClick={goToCurrentMonth}
                disabled={loading}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
              >
                Today
              </button>
            ) : (
              <span className="text-[11px] text-gray-400">This month</span>
            )}
          </div>
          <button
            type="button"
            onClick={goToNextMonth}
            disabled={loading}
            className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="calendar-record-type"
            className="mb-1 block text-[11px] font-medium text-gray-600"
          >
            Record type
          </label>
          <select
            id="calendar-record-type"
            value={recordType}
            onChange={(event) => {
              setExpandedDayKey(null);
              setRecordType(event.target.value as CalendarRecordTypeFilter);
            }}
            disabled={Boolean(error) && !hasLoadedOnce}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-800 disabled:opacity-60"
          >
            <option value="ALL">All</option>
            <option value="CLIENT">Clients</option>
            <option value="LEAD">Leads</option>
          </select>
        </div>

        <div className={isSuperAdmin ? 'sm:col-span-1' : 'sm:col-span-1 lg:col-span-2'}>
          <label
            htmlFor="calendar-search"
            className="mb-1 block text-[11px] font-medium text-gray-600"
          >
            Search
          </label>
          <input
            id="calendar-search"
            type="search"
            value={searchInput}
            onChange={(event) => {
              setExpandedDayKey(null);
              setSearchInput(event.target.value);
            }}
            placeholder="Label or client/lead name"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-800"
          />
        </div>

        {isSuperAdmin ? (
          <div>
            <label
              htmlFor="calendar-assigned-user"
              className="mb-1 block text-[11px] font-medium text-gray-600"
            >
              Assigned user
            </label>
            <select
              id="calendar-assigned-user"
              value={assignedUserId}
              onChange={(event) => {
                setExpandedDayKey(null);
                setAssignedUserId(event.target.value);
              }}
              disabled={adminUsersLoading}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-800 disabled:opacity-60"
            >
              <option value="">All users</option>
              {activeAdminUsers.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.userName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex items-end">
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-800">
              Couldn’t load important dates
            </p>
            <p className="mt-0.5 text-sm text-red-700">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setRetryToken((value) => value + 1)}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            Retry
          </button>
        </div>
      ) : null}

      {!error ? (
        <div className="relative mt-3">
          {loading ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70"
              aria-live="polite"
              aria-label="Loading important dates"
            >
              <Loader2
                className="h-6 w-6 animate-spin text-blue-600"
                aria-hidden
              />
            </div>
          ) : null}

          <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
            <div className="min-w-[20rem] sm:min-w-[36rem]">
              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label.long}
                    className="bg-gray-50 px-0.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:px-1 sm:text-[11px]"
                  >
                    <span className="sm:hidden">{label.short}</span>
                    <span className="hidden sm:inline">{label.long}</span>
                  </div>
                ))}

                {cells.map((cell) => {
                  const dayEvents = eventsByDate.get(cell.dateKey) ?? [];
                  const isExpanded = expandedDayKey === cell.dateKey;
                  const maxVisible = isExpanded
                    ? dayEvents.length
                    : MAX_VISIBLE_EVENTS_DESKTOP;
                  const visibleEvents = dayEvents.slice(0, maxVisible);
                  const hiddenCount = Math.max(0, dayEvents.length - maxVisible);
                  const mobileHiddenCount = Math.max(
                    0,
                    dayEvents.length - MAX_VISIBLE_EVENTS_MOBILE
                  );

                  return (
                    <div
                      key={cell.key}
                      className={`relative flex min-h-[4.25rem] flex-col bg-white p-0.5 sm:min-h-[6.5rem] sm:p-1.5 ${
                        cell.inCurrentMonth ? '' : 'bg-gray-50'
                      } ${cell.isToday ? 'ring-1 ring-inset ring-blue-400' : ''}`}
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-0.5 sm:mb-1">
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums sm:h-6 sm:w-6 sm:text-xs ${
                            cell.isToday
                              ? 'bg-blue-600 text-white'
                              : cell.inCurrentMonth
                                ? 'text-gray-800'
                                : 'text-gray-400'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        {dayEvents.length > 0 ? (
                          <span className="text-[10px] tabular-nums text-gray-400 sm:hidden">
                            {dayEvents.length}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                        {visibleEvents.map((event, index) => (
                          <div
                            key={event.id}
                            className={
                              !isExpanded && index >= MAX_VISIBLE_EVENTS_MOBILE
                                ? 'hidden sm:block'
                                : undefined
                            }
                          >
                            <EventChip
                              event={event}
                              onSelect={setSelectedEvent}
                            />
                          </div>
                        ))}

                        {!isExpanded && hiddenCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedDayKey(cell.dateKey)}
                            className="hidden text-left text-[10px] font-medium text-blue-600 hover:text-blue-700 sm:block"
                          >
                            +{hiddenCount} more
                          </button>
                        ) : null}

                        {!isExpanded && mobileHiddenCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedDayKey(cell.dateKey)}
                            className="text-left text-[10px] font-medium text-blue-600 hover:text-blue-700 sm:hidden"
                          >
                            +{mobileHiddenCount} more
                          </button>
                        ) : null}

                        {isExpanded &&
                        dayEvents.length > MAX_VISIBLE_EVENTS_MOBILE ? (
                          <button
                            type="button"
                            onClick={() => setExpandedDayKey(null)}
                            className="text-left text-[10px] font-medium text-gray-500 hover:text-gray-700"
                          >
                            Show less
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {isEmptyMonth ? (
            <p className="mt-3 text-center text-sm text-gray-500 sm:text-left">
              {hasActiveFilters
                ? 'No important dates match your filters for this month.'
                : 'No important dates scheduled for this month.'}
            </p>
          ) : null}
        </div>
      ) : null}

      {!error ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
            Client
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            Lead
          </span>
        </div>
      ) : null}

      <ImportantDateEventDetailModal
        event={selectedEvent}
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        onChanged={() => setRetryToken((value) => value + 1)}
      />

      <AddImportantDateFromCalendarModal
        isOpen={isAddModalOpen}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={() => setRetryToken((value) => value + 1)}
      />
    </section>
  );
}
