'use client';

import { useEffect, useState } from 'react';
import ActivityLog, { type ActivityLogEntry } from '@/components/clients/ActivityLog';
import StrategyAndTasks, {
  type StrategyCurrentUser,
  type StrategyTask,
} from '@/components/clients/StrategyAndTasks';

type WorkspacePanelProps = {
  clientId: string;
  strategyText: string;
  tasks: StrategyTask[];
  activityLog: ActivityLogEntry[];
  currentUser: StrategyCurrentUser | null;
  assignedUsers: { user_id: string; role: string }[];
  canPostNote?: boolean;
  onNotePosted?: () => void;
  onStrategyTasksUpdated?: () => void;
};

const TABS = [
  { id: 'strategy-tasks', label: 'Strategy & Tasks' },
  { id: 'activity-notes', label: 'Activity & Notes' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function WorkspacePanel({
  clientId,
  strategyText,
  tasks,
  activityLog,
  currentUser,
  assignedUsers,
  canPostNote = false,
  onNotePosted,
  onStrategyTasksUpdated,
}: WorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('strategy-tasks');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.location.hash === '#activity-notes') {
      setActiveTab('activity-notes');
      document.getElementById('workspace-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, []);

  return (
    <section id="workspace-panel" className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 pt-5">
        <h2 className="text-lg font-semibold text-gray-900">Workspace</h2>
        <nav className="mt-4 flex gap-6" aria-label="Workspace tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
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
      </div>

      <div className="p-6">
        {activeTab === 'strategy-tasks' && (
          <StrategyAndTasks
            clientId={clientId}
            strategyText={strategyText}
            tasks={tasks}
            currentUser={currentUser}
            assignedUsers={assignedUsers}
            onUpdated={onStrategyTasksUpdated}
          />
        )}

        {activeTab === 'activity-notes' && (
          <ActivityLog
            clientId={clientId}
            activityLog={activityLog}
            canPostNote={canPostNote}
            onNotePosted={onNotePosted}
          />
        )}
      </div>
    </section>
  );
}
