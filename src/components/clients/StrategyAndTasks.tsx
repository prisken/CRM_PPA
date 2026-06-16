'use client';

import { useEffect, useState } from 'react';
import TaskEditModal from '@/components/clients/TaskEditModal';

export type StrategyTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  assignee: { user_id: string; name: string } | null;
};

export type StrategyCurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type AssignedUserOption = {
  user_id: string;
  name: string;
  role: string;
};

type StrategyAndTasksProps = {
  clientId: string;
  strategyText: string;
  tasks: StrategyTask[];
  currentUser: StrategyCurrentUser | null;
  assignedUsers: AssignedUserOption[];
  onUpdated?: () => void;
};

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function StrategyAndTasks({
  clientId,
  strategyText,
  tasks,
  currentUser,
  assignedUsers,
  onUpdated,
}: StrategyAndTasksProps) {
  const [draftStrategyText, setDraftStrategyText] = useState(strategyText);
  const [isSavingStrategy, setIsSavingStrategy] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<StrategyTask | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);

  const canManage =
    currentUser?.role === 'SUPER_ADMIN' ||
    assignedUsers.some(
      (user) => user.user_id === currentUser?.id && user.role === 'DOCTOR'
    );

  useEffect(() => {
    setDraftStrategyText(strategyText);
  }, [strategyText]);

  const strategyDirty = draftStrategyText !== strategyText;

  async function handleSaveStrategy() {
    setIsSavingStrategy(true);
    setStrategyError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/strategy`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyText: draftStrategyText }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to update strategy'
        );
      }

      onUpdated?.();
    } catch (err) {
      setStrategyError(
        err instanceof Error ? err.message : 'Failed to update strategy'
      );
    } finally {
      setIsSavingStrategy(false);
    }
  }

  function openCreateTaskModal() {
    setEditingTask(null);
    setTaskModalOpen(true);
  }

  function openEditTaskModal(task: StrategyTask) {
    setEditingTask(task);
    setTaskModalOpen(true);
  }

  function closeTaskModal() {
    setTaskModalOpen(false);
    setEditingTask(null);
  }

  async function handleCompleteTask(taskId: string) {
    setCompletingTaskId(taskId);
    setTaskActionError(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: 'PUT',
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to complete task'
        );
      }

      onUpdated?.();
    } catch (err) {
      setTaskActionError(
        err instanceof Error ? err.message : 'Failed to complete task'
      );
    } finally {
      setCompletingTaskId(null);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!window.confirm('Delete this task? This cannot be undone.')) {
      return;
    }

    setDeletingTaskId(taskId);
    setTaskActionError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/tasks/${taskId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to delete task'
        );
      }

      onUpdated?.();
    } catch (err) {
      setTaskActionError(
        err instanceof Error ? err.message : 'Failed to delete task'
      );
    } finally {
      setDeletingTaskId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Strategy
          </h3>
          {canManage && strategyDirty && (
            <button
              type="button"
              onClick={handleSaveStrategy}
              disabled={isSavingStrategy}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isSavingStrategy ? 'Saving...' : 'Save Strategy'}
            </button>
          )}
        </div>

        {canManage ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <textarea
              value={draftStrategyText}
              onChange={(event) => setDraftStrategyText(event.target.value)}
              rows={14}
              placeholder="Document the client's strategy, goals, and key initiatives..."
              className="min-h-[280px] w-full resize-y border-0 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            />
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
              <span>Strategy document</span>
              <span>{draftStrategyText.length} characters</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            {strategyText.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {strategyText}
              </p>
            ) : (
              <p className="text-sm text-gray-500">No strategy documented yet.</p>
            )}
          </div>
        )}

        {strategyError && (
          <p className="mt-2 text-sm text-red-600">{strategyError}</p>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Tasks
          </h3>
          {canManage && (
            <button
              type="button"
              onClick={openCreateTaskModal}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              + Create Task
            </button>
          )}
        </div>

        {taskActionError && (
          <p className="mb-3 text-sm text-red-600">{taskActionError}</p>
        )}

        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">No tasks yet.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => {
              const isCompleted = task.status === 'COMPLETED';
              const isCompleting = completingTaskId === task.id;
              const isDeleting = deletingTaskId === task.id;

              return (
                <li
                  key={task.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      disabled={isCompleted || isCompleting || !canManage}
                      onChange={() => handleCompleteTask(task.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-50"
                      aria-label={`Complete task: ${task.title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-sm font-medium ${
                            isCompleted
                              ? 'text-gray-400 line-through'
                              : 'text-gray-900'
                          }`}
                        >
                          {task.title}
                        </p>
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                          {formatStatusLabel(task.status)}
                        </span>
                      </div>
                      {task.description && (
                        <p className="mt-1 text-xs text-gray-600">{task.description}</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                        {task.dueDate && (
                          <span>
                            Due {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        {task.assignee && <span>Assigned to {task.assignee.name}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditTaskModal(task)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          disabled={isDeleting}
                          className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TaskEditModal
        clientId={clientId}
        assignedUsers={assignedUsers}
        task={editingTask}
        isOpen={taskModalOpen}
        onClose={closeTaskModal}
        onSaved={() => onUpdated?.()}
      />
    </div>
  );
}
