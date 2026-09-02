'use client';

import { useMemo, useState } from 'react';

export type ActivityLogEntry = {
  id: string;
  type: string;
  content: string;
  date: string;
  source: 'manual' | 'system';
  userId?: string | null;
  userName: string | null;
};

type ActivityLogCurrentUser = {
  id: string;
  role: string;
};

type ActivityLogProps = {
  clientId: string;
  activityLog: ActivityLogEntry[];
  currentUser?: ActivityLogCurrentUser | null;
  canPostNote?: boolean;
  onNotePosted?: () => void;
};

const INTERACTION_TYPES = [
  { value: 'NOTE', label: 'Note' },
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
] as const;

const FILTER_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'NOTE', label: 'Notes' },
  { value: 'EMAIL', label: 'Emails' },
  { value: 'CALL', label: 'Calls' },
  { value: 'MEETING', label: 'Meetings' },
  { value: 'SYSTEM', label: 'System' },
] as const;

type ActivityFilter = (typeof FILTER_OPTIONS)[number]['value'];

function formatActivityDate(date: string) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTypeLabel(type: string) {
  if (type === 'SYSTEM') {
    return 'System';
  }

  return type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function matchesFilter(entry: ActivityLogEntry, filter: ActivityFilter) {
  if (filter === 'ALL') {
    return true;
  }

  if (filter === 'SYSTEM') {
    return entry.source === 'system';
  }

  return entry.source === 'manual' && entry.type === filter;
}

type ActivityLogItemProps = {
  entry: ActivityLogEntry;
  clientId: string;
  canManage: boolean;
  onUpdated?: () => void;
};

function ActivityLogItem({
  entry,
  clientId,
  canManage,
  onUpdated,
}: ActivityLogItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSystem = entry.source === 'system';

  async function handleSaveEdit() {
    const content = editContent.trim();
    if (!content) {
      setError('Content cannot be empty.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/clients/${clientId}/interactions/${entry.id}`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to update interaction'
        );
      }

      setIsEditing(false);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update interaction');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this interaction? This cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/clients/${clientId}/interactions/${entry.id}`,
        {
          method: 'DELETE',
          credentials: 'same-origin',
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to delete interaction'
        );
      }

      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete interaction');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <li
      className={`rounded-lg border px-4 py-3 ${
        isSystem
          ? 'border-amber-100 bg-amber-50'
          : 'border-blue-100 bg-blue-50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isSystem
                ? 'bg-amber-100 text-amber-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {formatTypeLabel(isSystem ? 'SYSTEM' : entry.type)}
          </span>
          {entry.userName && (
            <span className="text-xs text-gray-500">by {entry.userName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <time className="text-xs text-gray-500">{formatActivityDate(entry.date)}</time>
          {canManage && !isSystem && !isEditing && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditContent(entry.content);
                  setError(null);
                  setIsEditing(true);
                }}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-white active:bg-gray-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditContent(entry.content);
                setError(null);
              }}
              disabled={isSaving}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white active:bg-gray-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-800">{entry.content}</p>
      )}

      {!isEditing && error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </li>
  );
}

export default function ActivityLog({
  clientId,
  activityLog,
  currentUser = null,
  canPostNote = false,
  onNotePosted,
}: ActivityLogProps) {
  const [interactionType, setInteractionType] = useState<string>('NOTE');
  const [content, setContent] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredActivity = useMemo(
    () => activityLog.filter((entry) => matchesFilter(entry, activeFilter)),
    [activityLog, activeFilter]
  );

  async function handleLogInteraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('Please enter interaction content before logging.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/interactions`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: interactionType,
          content: trimmedContent,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to log interaction'
        );
      }

      setContent('');
      onNotePosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log interaction');
    } finally {
      setIsSubmitting(false);
    }
  }

  function canManageEntry(entry: ActivityLogEntry) {
    if (!currentUser) {
      return false;
    }

    if (currentUser.role === 'SUPER_ADMIN') {
      return true;
    }

    return entry.userId === currentUser.id;
  }

  return (
    <div className="space-y-4">
      {canPostNote && (
        <form onSubmit={handleLogInteraction} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div>
            <label
              htmlFor="interaction-type"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Interaction Type
            </label>
            <select
              id="interaction-type"
              value={interactionType}
              onChange={(event) => setInteractionType(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm sm:max-w-xs"
            >
              {INTERACTION_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="interaction-content"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Content
            </label>
            <textarea
              id="interaction-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={3}
              placeholder="Describe the call, email, meeting, or note..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 sm:ml-auto"
            >
              {isSubmitting ? 'Logging...' : 'Log Interaction'}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setActiveFilter(option.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeFilter === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filteredActivity.length === 0 ? (
        <p className="text-sm text-gray-500">
          {activityLog.length === 0
            ? 'No activity yet.'
            : 'No activity matches this filter.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {filteredActivity.map((entry) => (
            <ActivityLogItem
              key={entry.id}
              entry={entry}
              clientId={clientId}
              canManage={canManageEntry(entry)}
              onUpdated={onNotePosted}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
