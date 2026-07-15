'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import EmptyMuted from '@/components/ui/EmptyMuted';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getWidgetPaddingClass } from '@/components/ui/displayDensity';
import type { OpenTaskRow } from '@/lib/dashboardTypes';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type MyTasksWidgetProps = {
  openTasks: OpenTaskRow[];
  error?: string | null;
};

function formatDueDate(dueDate: string | null) {
  if (!dueDate) {
    return null;
  }

  return new Date(dueDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

const TaskListItem = memo(function TaskListItem({
  task,
  isCompleting,
  onComplete,
}: {
  task: OpenTaskRow;
  isCompleting: boolean;
  onComplete: (taskId: string) => void;
}) {
  const overdue = isOverdue(task.dueDate);
  const dueLabel = formatDueDate(task.dueDate);

  return (
    <li
      className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${
        overdue ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'
      }`}
    >
      <input
        type="checkbox"
        checked={false}
        disabled={isCompleting}
        onChange={() => onComplete(task.taskId)}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-60"
        aria-label={`Complete task: ${task.description}`}
      />
      <div className="min-w-0 flex-1">
        <p
          className="line-clamp-2 text-sm font-medium text-gray-900"
          title={task.description}
        >
          {task.description}
        </p>
        <p className="mt-1 truncate text-xs text-gray-600">
          <Link
            href={`/clients/${task.clientId}`}
            className="font-medium text-blue-600 hover:underline"
            title={task.clientName}
          >
            {task.clientName}
          </Link>
        </p>
        <p
          className={`mt-1 text-xs ${
            overdue ? 'font-semibold text-red-600' : 'text-gray-500'
          }`}
        >
          {dueLabel ? (
            <>Due {dueLabel}</>
          ) : (
            <EmptyMuted label="No due date" />
          )}
        </p>
      </div>
    </li>
  );
});

function MyTasksWidget({ openTasks, error = null }: MyTasksWidgetProps) {
  const { density } = useDisplayDensity();
  const widgetPaddingClass = getWidgetPaddingClass(density);
  const [tasks, setTasks] = useState(openTasks);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setTasks(openTasks);
  }, [openTasks]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) {
        return 0;
      }
      if (!a.dueDate) {
        return 1;
      }
      if (!b.dueDate) {
        return -1;
      }
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [tasks]);

  const handleComplete = useCallback(async (taskId: string) => {
    setCompletingTaskId(taskId);
    setActionError(null);

    try {
      const res = await authenticatedFetch(`/api/tasks/${taskId}/complete`, {
        method: 'PUT',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to complete task'
        );
      }

      setTasks((current) => current.filter((task) => task.taskId !== taskId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setCompletingTaskId(null);
    }
  }, []);

  const displayError = actionError ?? error;

  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-sm ${widgetPaddingClass}`}>
      <h2 className="text-sm font-semibold text-gray-900">My Open Tasks</h2>

      {displayError && <p className="mt-2 text-sm text-red-600">{displayError}</p>}

      {sortedTasks.length === 0 ? (
        <p className="mt-2.5 text-sm text-gray-500">No open tasks.</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {sortedTasks.map((task) => (
            <TaskListItem
              key={task.taskId}
              task={task}
              isCompleting={completingTaskId === task.taskId}
              onComplete={handleComplete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(MyTasksWidget);
