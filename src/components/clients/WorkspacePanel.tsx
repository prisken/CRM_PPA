'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import ActivityLog, { type ActivityLogEntry } from '@/components/clients/ActivityLog';
import StrategyAndTasks, {
  type StrategyCurrentUser,
  type StrategyTask,
} from '@/components/clients/StrategyAndTasks';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type WorkspacePanelProps = {
  clientId: string;
  currentUser: StrategyCurrentUser | null;
  assignedUsers: { user_id: string; name: string; role: string }[];
  canPostNote?: boolean;
  refreshKey?: number;
  onMutationSuccess?: () => void;
};

const TABS = [
  { id: 'strategy-tasks', label: 'Strategy & Tasks' },
  { id: 'activity-notes', label: 'Activity & Notes' },
] as const;

type TabId = (typeof TABS)[number]['id'];

type StrategyTasksData = {
  strategyText: string;
  tasks: StrategyTask[];
};

export default function WorkspacePanel({
  clientId,
  currentUser,
  assignedUsers,
  canPostNote = false,
  refreshKey = 0,
  onMutationSuccess,
}: WorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('strategy-tasks');
  const [loadedTabs, setLoadedTabs] = useState<Set<TabId>>(() => new Set(['strategy-tasks']));
  const [strategyTasksData, setStrategyTasksData] = useState<StrategyTasksData | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [loadingTab, setLoadingTab] = useState<TabId | null>('strategy-tasks');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.location.hash === '#activity-notes') {
      setActiveTab('activity-notes');
      setLoadedTabs((current) => new Set([...current, 'activity-notes']));
      document.getElementById('workspace-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, []);

  useEffect(() => {
    if (!loadedTabs.has(activeTab)) {
      return;
    }

    let cancelled = false;

    async function loadWorkspaceTab() {
      setLoadingTab(activeTab);
      setError(null);

      try {
        const res = await authenticatedFetch(
          `/api/clients/${clientId}/workspace?tab=${activeTab}`
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

        if (activeTab === 'strategy-tasks') {
          setStrategyTasksData({
            strategyText: data.strategyText ?? '',
            tasks: data.tasks ?? [],
          });
        } else {
          setActivityLog(data.activityLog ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workspace data');
        }
      } finally {
        if (!cancelled) {
          setLoadingTab(null);
        }
      }
    }

    loadWorkspaceTab();

    return () => {
      cancelled = true;
    };
  }, [activeTab, clientId, loadedTabs, refreshKey]);

  function handleTabChange(tabId: TabId) {
    setActiveTab(tabId);
    setLoadedTabs((current) => new Set([...current, tabId]));
  }

  function handleMutationSuccess() {
    onMutationSuccess?.();
  }

  const activeTabLabel =
    TABS.find((tab) => tab.id === activeTab)?.label ?? TABS[0].label;

  return (
    <section id="workspace-panel" className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 pt-5">
        <h2 className="text-lg font-semibold text-gray-900">Workspace</h2>

        <nav className="mt-4 hidden gap-6 md:flex" aria-label="Workspace tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
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
              className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-900"
              aria-label="Select workspace tab"
            >
              <span>{activeTabLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
            </MenuButton>
            <MenuItems
              anchor="bottom start"
              className="z-10 w-[var(--button-width)] rounded-lg border border-gray-200 bg-white py-1 shadow-lg [--anchor-gap:4px]"
            >
              {TABS.map((tab) => (
                <MenuItem key={tab.id}>
                  <button
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`block w-full px-3 py-2 text-left text-sm data-focus:bg-gray-100 ${
                      activeTab === tab.id
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

      <div className="p-6">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loadingTab === activeTab ? (
          <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
        ) : activeTab === 'strategy-tasks' ? (
          <StrategyAndTasks
            clientId={clientId}
            strategyText={strategyTasksData?.strategyText ?? ''}
            tasks={strategyTasksData?.tasks ?? []}
            currentUser={currentUser}
            assignedUsers={assignedUsers}
            onUpdated={handleMutationSuccess}
          />
        ) : (
          <ActivityLog
            clientId={clientId}
            activityLog={activityLog}
            currentUser={
              currentUser
                ? { id: currentUser.id, role: currentUser.role }
                : null
            }
            canPostNote={canPostNote}
            onNotePosted={handleMutationSuccess}
          />
        )}
      </div>
    </section>
  );
}
