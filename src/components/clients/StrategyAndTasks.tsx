'use client';

import { useEffect, useState } from 'react';

type EditStrategyModalProps = {
  clientId: string;
  initialStrategyText: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function EditStrategyModal({
  clientId,
  initialStrategyText,
  isOpen,
  onClose,
  onSaved,
}: EditStrategyModalProps) {
  const [strategyText, setStrategyText] = useState(initialStrategyText);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setStrategyText(initialStrategyText);
    setError(null);
  }, [isOpen, initialStrategyText]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/strategy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyText }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to update strategy');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update strategy');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Edit Strategy</h3>
        <p className="mt-1 text-sm text-gray-500">
          Update the client&apos;s strategy document.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="strategy-text"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Strategy
            </label>
            <textarea
              id="strategy-text"
              value={strategyText}
              onChange={(event) => setStrategyText(event.target.value)}
              rows={12}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type AddTaskModalProps = {
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function AddTaskModal({ clientId, isOpen, onClose, onSaved }: AddTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle('');
    setDescription('');
    setDueDate('');
    setError(null);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueDate || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to add task');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Add Task</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create a new task for this client.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="task-title"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Title
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="task-description"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Description
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="task-due-date"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Due Date
            </label>
            <input
              id="task-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type StrategyTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
};

export type StrategyCurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type StrategyAndTasksProps = {
  clientId: string;
  strategyText: string;
  tasks: StrategyTask[];
  currentUser: StrategyCurrentUser | null;
  assignedUsers: { user_id: string; role: string }[];
  onUpdated?: () => void;
};

export default function StrategyAndTasks({
  clientId,
  strategyText,
  tasks,
  currentUser,
  assignedUsers,
  onUpdated,
}: StrategyAndTasksProps) {
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const canManage =
    currentUser?.role === 'SUPER_ADMIN' ||
    assignedUsers.some(
      (user) => user.user_id === currentUser?.id && user.role === 'DOCTOR'
    );

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Strategy
          </h3>
          {canManage && (
            <button
              type="button"
              onClick={() => setIsStrategyModalOpen(true)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit Strategy
            </button>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          {strategyText.trim() ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {strategyText}
            </p>
          ) : (
            <p className="text-sm text-gray-500">No strategy documented yet.</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Tasks
          </h3>
          {canManage && (
            <button
              type="button"
              onClick={() => setIsTaskModalOpen(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              + Add Task
            </button>
          )}
        </div>

        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">No tasks yet.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => {
              const isCompleted = task.status === 'COMPLETED';

              return (
                <li
                  key={task.id}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    readOnly
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                    aria-label={`Task: ${task.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        isCompleted
                          ? 'text-gray-400 line-through'
                          : 'text-gray-900'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="mt-1 text-xs text-gray-600">{task.description}</p>
                    )}
                    {task.dueDate && (
                      <p className="mt-1 text-xs text-gray-400">
                        Due {new Date(task.dueDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <EditStrategyModal
        clientId={clientId}
        initialStrategyText={strategyText}
        isOpen={isStrategyModalOpen}
        onClose={() => setIsStrategyModalOpen(false)}
        onSaved={() => onUpdated?.()}
      />

      <AddTaskModal
        clientId={clientId}
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSaved={() => onUpdated?.()}
      />
    </div>
  );
}
