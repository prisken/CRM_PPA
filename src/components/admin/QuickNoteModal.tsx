'use client';

import { memo, useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

const NOTE_TYPES = [
  { value: 'NOTE', label: 'Note' },
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
] as const;

type NoteType = (typeof NOTE_TYPES)[number]['value'];

type QuickNoteModalProps = {
  clientId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function QuickNoteModal({
  clientId,
  clientName,
  open,
  onClose,
  onSaved,
}: QuickNoteModalProps) {
  const [type, setType] = useState<NoteType>('NOTE');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setType('NOTE');
    setContent('');
    setError(null);
    setIsSubmitting(false);
  }, [open, clientId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isSubmitting, onClose]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = content.trim();
    if (!trimmed) {
      setError('Note content is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authenticatedFetch(`/api/clients/${clientId}/quick-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmed,
          type,
          mode: 'interaction',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to save note'
        );
      }

      onSaved();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to save note'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-note-title"
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <h3 id="quick-note-title" className="text-lg font-semibold text-gray-900">
            Add quick note
          </h3>
          <p className="mt-1 text-sm text-gray-500">{clientName}</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="quick-note-type"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Type
              </label>
              <select
                id="quick-note-type"
                value={type}
                onChange={(event) => setType(event.target.value as NoteType)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-60"
              >
                {NOTE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="quick-note-content"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Note
              </label>
              <textarea
                id="quick-note-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={isSubmitting}
                rows={5}
                placeholder="Add a quick note about this lead..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default memo(QuickNoteModal);
