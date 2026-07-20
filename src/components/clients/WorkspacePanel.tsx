'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActivityLog, { type ActivityLogEntry } from '@/components/clients/ActivityLog';
import StrategyAndTasks, {
  type StrategyCurrentUser,
  type StrategyTask,
} from '@/components/clients/StrategyAndTasks';
import { StrategyPlannerPanelSkeleton } from '@/components/clients/strategyPlannerLoading';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import {
  getSectionCardHeaderPaddingClass,
  getWidgetPaddingClass,
} from '@/components/ui/displayDensity';

const ClientStrategyBuilderWidget = dynamic(
  () => import('@/components/clients/ClientStrategyBuilderWidget'),
  {
    ssr: false,
    loading: () => (
      <StrategyPlannerPanelSkeleton label="Loading Strategy Planner…" />
    ),
  }
);

type WorkspacePanelProps = {
  clientId: string;
  currentUser: StrategyCurrentUser | null;
  assignedUsers: { user_id: string; name: string; role: string }[];
  canPostNote?: boolean;
  /**
   * Bumped by Client 360 `workspace` slice refreshes (and `all`).
   * Invalidates workspace tab caches only — does not come from tab mutations.
   */
  pageRefreshKey?: number;
  strategyAccess?: {
    canView: boolean;
    canManage: boolean;
  };
};

const BASE_TABS = [
  { id: 'strategy-tasks', label: 'Strategy & Tasks' },
  { id: 'strategy-planner', label: 'Strategy Planner' },
  { id: 'activity-notes', label: 'Activity & Notes' },
] as const;

type TabId = (typeof BASE_TABS)[number]['id'];
type WorkspaceApiTab = 'strategy-tasks' | 'activity-notes';

type StrategyTasksData = {
  strategyText: string;
  tasks: StrategyTask[];
};

type TabDataCache = {
  pageRefreshKey: number;
  strategyTasks: StrategyTasksData | null;
  activityNotes: ActivityLogEntry[] | null;
};

function isWorkspaceApiTab(tabId: TabId): tabId is WorkspaceApiTab {
  return tabId === 'strategy-tasks' || tabId === 'activity-notes';
}

function readTabFromHash(canViewStrategyPlanner: boolean): TabId | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = window.location.hash;
  if (hash === '#activity-notes') {
    return 'activity-notes';
  }
  if (hash === '#strategy-planner' && canViewStrategyPlanner) {
    return 'strategy-planner';
  }
  return null;
}

export default function WorkspacePanel({
  clientId,
  currentUser,
  assignedUsers,
  canPostNote = false,
  pageRefreshKey = 0,
  strategyAccess = { canView: false, canManage: false },
}: WorkspacePanelProps) {
  const { density } = useDisplayDensity();
  const tabs = useMemo(
    () =>
      BASE_TABS.filter(
        (tab) => tab.id !== 'strategy-planner' || strategyAccess.canView
      ),
    [strategyAccess.canView]
  );

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    return readTabFromHash(strategyAccess.canView) ?? 'strategy-tasks';
  });
  const [loadedTabs, setLoadedTabs] = useState<Set<TabId>>(() => {
    const fromHash = readTabFromHash(strategyAccess.canView);
    return new Set<TabId>(
      fromHash ? ['strategy-tasks', fromHash] : ['strategy-tasks']
    );
  });
  const [strategyTasksData, setStrategyTasksData] =
    useState<StrategyTasksData | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [loadingTab, setLoadingTab] = useState<TabId | null>('strategy-tasks');
  const [error, setError] = useState<string | null>(null);
  const [strategyTasksReloadKey, setStrategyTasksReloadKey] = useState(0);
  const [activityReloadKey, setActivityReloadKey] = useState(0);
  const tabDataCacheRef = useRef<TabDataCache>({
    pageRefreshKey: -1,
    strategyTasks: null,
    activityNotes: null,
  });

  // Fall back in render when planner is hidden — avoids sync setState in an effect.
  const resolvedTab: TabId =
    activeTab === 'strategy-planner' && !strategyAccess.canView
      ? 'strategy-tasks'
      : activeTab;

  useEffect(() => {
    function applyHashNavigation() {
      const nextTab = readTabFromHash(strategyAccess.canView);
      if (!nextTab) {
        return;
      }

      setActiveTab(nextTab);
      setLoadedTabs((current) => new Set([...current, nextTab]));
      document.getElementById('workspace-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }

    window.addEventListener('hashchange', applyHashNavigation);
    // Deep-link on first paint was applied via useState initializer; only scroll.
    if (readTabFromHash(strategyAccess.canView)) {
      document.getElementById('workspace-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }

    return () => {
      window.removeEventListener('hashchange', applyHashNavigation);
    };
  }, [strategyAccess.canView]);

  useEffect(() => {
    if (!loadedTabs.has(resolvedTab)) {
      return;
    }

    // Strategy Planner loads its own data via ClientStrategyBuilderWidget.
    if (resolvedTab === 'strategy-planner' || !isWorkspaceApiTab(resolvedTab)) {
      return;
    }

    const cache = tabDataCacheRef.current;
    if (cache.pageRefreshKey !== pageRefreshKey) {
      cache.pageRefreshKey = pageRefreshKey;
      cache.strategyTasks = null;
      cache.activityNotes = null;
    }

    if (resolvedTab === 'strategy-tasks' && cache.strategyTasks) {
      setStrategyTasksData(cache.strategyTasks);
      setLoadingTab(null);
      return;
    }

    if (resolvedTab === 'activity-notes' && cache.activityNotes) {
      setActivityLog(cache.activityNotes);
      setLoadingTab(null);
      return;
    }

    let cancelled = false;

    async function loadWorkspaceTab() {
      setLoadingTab(resolvedTab);
      setError(null);

      try {
        const res = await authenticatedFetch(
          `/api/clients/${clientId}/workspace?tab=${resolvedTab}`
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Failed to load workspace data'
          );
        }

        const data = await res.json();
        if (cancelled) {
          return;
        }

        if (resolvedTab === 'strategy-tasks') {
          const nextStrategyTasks = {
            strategyText: data.strategyText ?? '',
            tasks: data.tasks ?? [],
          };
          cache.strategyTasks = nextStrategyTasks;
          setStrategyTasksData(nextStrategyTasks);
        } else {
          const nextActivityLog = data.activityLog ?? [];
          cache.activityNotes = nextActivityLog;
          setActivityLog(nextActivityLog);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load workspace data'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTab(null);
        }
      }
    }

    void loadWorkspaceTab();

    return () => {
      cancelled = true;
    };
  }, [
    resolvedTab,
    clientId,
    loadedTabs,
    pageRefreshKey,
    strategyTasksReloadKey,
    activityReloadKey,
  ]);

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    setLoadedTabs((current) => new Set([...current, tabId]));
  }, []);

  const reloadStrategyTasksTab = useCallback(() => {
    tabDataCacheRef.current.strategyTasks = null;
    setStrategyTasksReloadKey((current) => current + 1);
  }, []);

  const reloadActivityTab = useCallback(() => {
    tabDataCacheRef.current.activityNotes = null;
    setActivityReloadKey((current) => current + 1);
  }, []);

  const activityLogCurrentUser = useMemo(
    () =>
      currentUser
        ? { id: currentUser.id, role: currentUser.role }
        : null,
    [currentUser]
  );

  const activeTabLabel =
    tabs.find((tab) => tab.id === resolvedTab)?.label ?? tabs[0]?.label ?? '';

  const isStrategyPlanner = resolvedTab === 'strategy-planner';
  const contentPaddingClass = isStrategyPlanner
    ? getWidgetPaddingClass(density)
    : 'p-6';
  const headerPaddingClass = isStrategyPlanner
    ? getSectionCardHeaderPaddingClass(density)
    : 'px-6 pt-5';

  return (
    <section
      id="workspace-panel"
      className="w-full min-w-0 overflow-x-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      <div className={`border-b border-gray-200 ${headerPaddingClass}`}>
        <h2 className="text-lg font-semibold text-gray-900">Workspace</h2>

        <nav className="mt-4 hidden gap-6 md:flex" aria-label="Workspace tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                resolvedTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="mt-4 block md:hidden">
          <Menu as="div" className="relative">
            <MenuButton
              className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              aria-label="Select workspace tab"
            >
              <span>{activeTabLabel}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-gray-500"
                aria-hidden="true"
              />
            </MenuButton>
            <MenuItems
              anchor="bottom start"
              className="z-30 w-[var(--button-width)] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white py-1 shadow-lg [--anchor-gap:4px]"
            >
              {tabs.map((tab) => (
                <MenuItem key={tab.id}>
                  <button
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`block w-full px-3 py-2 text-left text-sm data-focus:bg-gray-100 focus-visible:outline-none focus-visible:bg-gray-100 ${
                      resolvedTab === tab.id
                        ? 'font-semibold text-blue-600'
                        : 'text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>
        </div>
      </div>

      <div className={`min-w-0 ${contentPaddingClass}`}>
        {error && !isStrategyPlanner ? (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        ) : null}

        {loadedTabs.has('strategy-planner') ? (
          <div className="w-full min-w-0" hidden={!isStrategyPlanner}>
            <ClientStrategyBuilderWidget
              clientId={clientId}
              canManage={strategyAccess.canManage}
            />
          </div>
        ) : null}

        {!isStrategyPlanner ? (
          loadingTab === resolvedTab ? (
            <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
          ) : resolvedTab === 'strategy-tasks' ? (
            <StrategyAndTasks
              clientId={clientId}
              strategyText={strategyTasksData?.strategyText ?? ''}
              tasks={strategyTasksData?.tasks ?? []}
              currentUser={currentUser}
              assignedUsers={assignedUsers}
              onUpdated={reloadStrategyTasksTab}
            />
          ) : (
            <ActivityLog
              clientId={clientId}
              activityLog={activityLog}
              currentUser={activityLogCurrentUser}
              canPostNote={canPostNote}
              onNotePosted={reloadActivityTab}
            />
          )
        ) : null}
      </div>
    </section>
  );
}
