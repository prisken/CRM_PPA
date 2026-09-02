'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

const MAX_TAGS_PER_REQUEST = 10;

type AdminTag = {
  id: string;
  name: string;
  color: string | null;
};

type BulkTagsModalProps = {
  clientIds: string[];
  open: boolean;
  onClose: () => void;
  onSaved: (count: number) => void;
};

function parseNewTagNames(value: string) {
  return [
    ...new Set(
      value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ];
}

function BulkTagsModal({
  clientIds,
  open,
  onClose,
  onSaved,
}: BulkTagsModalProps) {
  const [availableTags, setAvailableTags] = useState<AdminTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [selectedTagNames, setSelectedTagNames] = useState<Set<string>>(new Set());
  const [newTagNamesInput, setNewTagNamesInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newTagNames = useMemo(
    () => parseNewTagNames(newTagNamesInput),
    [newTagNamesInput]
  );

  const combinedTagNames = useMemo(() => {
    const names = new Set([...selectedTagNames, ...newTagNames]);
    return [...names];
  }, [newTagNames, selectedTagNames]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedTagNames(new Set());
    setNewTagNamesInput('');
    setError(null);
    setTagsError(null);
    setIsSubmitting(false);
  }, [open, clientIds]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadTags() {
      setTagsLoading(true);
      setTagsError(null);

      try {
        const response = await authenticatedFetch('/api/admin/tags');
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Failed to load tags'
          );
        }

        const data = (await response.json()) as AdminTag[];
        if (!cancelled) {
          setAvailableTags(Array.isArray(data) ? data : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setAvailableTags([]);
          setTagsError(
            loadError instanceof Error ? loadError.message : 'Failed to load tags'
          );
        }
      } finally {
        if (!cancelled) {
          setTagsLoading(false);
        }
      }
    }

    void loadTags();

    return () => {
      cancelled = true;
    };
  }, [open]);

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

  function toggleTagName(name: string) {
    setSelectedTagNames((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (clientIds.length === 0) {
      setError('Select at least one lead');
      return;
    }

    if (combinedTagNames.length === 0) {
      setError('Select or enter at least one tag');
      return;
    }

    if (combinedTagNames.length > MAX_TAGS_PER_REQUEST) {
      setError(`You can apply at most ${MAX_TAGS_PER_REQUEST} tags per request`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authenticatedFetch('/api/admin/leads/bulk-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientIds,
          tagNames: combinedTagNames,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to add tags'
        );
      }

      const data = (await response.json()) as { count?: number };
      const count = typeof data.count === 'number' ? data.count : 0;

      onSaved(count);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to add tags'
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
          aria-labelledby="bulk-tags-title"
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <h3 id="bulk-tags-title" className="text-lg font-semibold text-gray-900">
            Add tags
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {clientIds.length} lead{clientIds.length === 1 ? '' : 's'} selected
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Existing tags</p>
              {tagsLoading ? (
                <p className="text-sm text-gray-500">Loading tags...</p>
              ) : tagsError ? (
                <p className="text-sm text-red-600">{tagsError}</p>
              ) : availableTags.length === 0 ? (
                <p className="text-sm text-gray-500">No tags yet. Create one below.</p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-gray-200 p-3">
                  {availableTags.map((tag) => {
                    const isSelected = selectedTagNames.has(tag.name);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTagName(tag.name)}
                        disabled={isSubmitting}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          isSelected
                            ? 'bg-violet-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="bulk-tags-new"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                New tags
              </label>
              <input
                id="bulk-tags-new"
                type="text"
                value={newTagNamesInput}
                onChange={(event) => setNewTagNamesInput(event.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. VIP, Referral, Hot lead"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60 bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
              />
              <p className="mt-1 text-xs text-gray-500">
                Separate multiple new tag names with commas.
              </p>
            </div>

            {combinedTagNames.length > 0 && (
              <p className="text-sm text-gray-600">
                Applying {combinedTagNames.length} tag
                {combinedTagNames.length === 1 ? '' : 's'}: {combinedTagNames.join(', ')}
              </p>
            )}

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
                {isSubmitting ? 'Adding...' : 'Add tags'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default memo(BulkTagsModal);
