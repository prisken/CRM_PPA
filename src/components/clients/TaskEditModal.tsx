'use client';

import { useEffect, useState } from 'react';
import type { StrategyTask } from '@/components/clients/StrategyAndTasks';

const TASK_STATUSES = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

type AssignedUserOption = {
  user_id: string;
  name: string;
  role: string;
};

type TaskEditModalProps = {
  clientId: string;
  assignedUsers: AssignedUserOption[];
  task?: StrategyTask | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function toDateInputValue(dueDate: string | null) {
  if (!dueDate) {
    return '';
  }

  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

export default function TaskEditModal({
  clientId,
  assignedUsers,
  task = null,
  isOpen,
  onClose,
  onSaved,
}: TaskEditModalProps) {
  const isEditing = task !== null;
  const formKey = isOpen ? (task?.id ?? 'new') : 'closed';

  return (
    <TaskEditModalForm
      key={formKey}
      clientId={clientId}
      assignedUsers={assignedUsers}
      task={task}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function TaskEditModalForm({
  clientId,
  assignedUsers,
  task,
  isOpen,
  onClose,
  onSaved,
}: TaskEditModalProps) {
  const isEditing = task !== null;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueDate, setDueDate] = useState(toDateInputValue(task?.dueDate ?? null));
  const [status, setStatus] = useState(task?.status ?? 'PENDING');
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.user_id ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setDueDate(toDateInputValue(task?.dueDate ?? null));
    setStatus(task?.status ?? 'PENDING');
    setAssigneeId(task?.assignee?.user_id ?? '');
    setError(null);
  }, [isOpen, task]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      dueDate: dueDate || null,
      status,
      assigneeId: assigneeId || null,
    };

    try {
      const url = isEditing
        ? `/api/clients/${clientId}/tasks/${task!.id}`
        : `/api/clients/${clientId}/tasks`;
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to save task'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Task' : 'Create Task'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {isEditing
              ? 'Update task details and assignment.'
              : 'Create a new task for this client.'}
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

            <div className="grid gap-4 sm:grid-cols-2">
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

              <div>
                <label
                  htmlFor="task-status"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Status
                </label>
                <select
                  id="task-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {TASK_STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="task-assignee"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Assignee
              </label>
              <select
                id="task-assignee"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {assignedUsers.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
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
                {isSubmitting ? 'Saving...' : isEditing ? 'Save Task' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
