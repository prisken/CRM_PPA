'use client';

import { useState } from 'react';

export type ActivityLogEntry = {
  id: string;
  type: string;
  content: string;
  date: string;
  source: 'manual' | 'system';
  userName: string | null;
};

type ActivityLogProps = {
  clientId: string;
  activityLog: ActivityLogEntry[];
  canPostNote?: boolean;
  onNotePosted?: () => void;
};

function formatActivityDate(date: string) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ActivityLogItem({ entry }: { entry: ActivityLogEntry }) {
  const isSystem = entry.source === 'system';

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
            {isSystem ? 'System' : entry.type}
          </span>
          {entry.userName && (
            <span className="text-xs text-gray-500">by {entry.userName}</span>
          )}
        </div>
        <time className="text-xs text-gray-500">{formatActivityDate(entry.date)}</time>
      </div>
      <p className="mt-2 text-sm text-gray-800">{entry.content}</p>
    </li>
  );
}

export default function ActivityLog({
  clientId,
  activityLog,
  canPostNote = false,
  onNotePosted,
}: ActivityLogProps) {
  const [noteContent, setNoteContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePostNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = noteContent.trim();
    if (!content) {
      setError('Please enter a note before posting.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to post note');
      }

      setNoteContent('');
      onNotePosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post note');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {canPostNote && (
        <form onSubmit={handlePostNote} className="space-y-3">
          <label htmlFor="activity-note" className="sr-only">
            Add a note
          </label>
          <textarea
            id="activity-note"
            value={noteContent}
            onChange={(event) => setNoteContent(event.target.value)}
            rows={3}
            placeholder="Write a note about this client..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Posting...' : 'Post Note'}
            </button>
          </div>
        </form>
      )}

      {activityLog.length === 0 ? (
        <p className="text-sm text-gray-500">No activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {activityLog.map((entry) => (
            <ActivityLogItem key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
