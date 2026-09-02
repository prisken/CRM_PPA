'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

export type ConfirmActionModalProps = {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  warnings?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * Shared confirmation overlay matching PipelineStageAdvanceModal / CRM modal patterns.
 */
export default function ConfirmActionModal({
  isOpen,
  title,
  description,
  warnings = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  isSubmitting = false,
  error = null,
  onClose,
  onConfirm,
}: ConfirmActionModalProps) {
  // Esc closes.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const confirmClass =
    tone === 'danger'
      ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60'
      : 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="flex min-h-full items-end sm:items-center sm:justify-center">
        <div
          onClick={(event) => event.stopPropagation()}
          className="max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-y-contain rounded-t-2xl bg-white p-4 pb-safe shadow-xl sm:rounded-xl sm:p-6 sm:pb-6"
        >
          {/* Grab handle (phone). */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <div className="mt-2 text-sm text-gray-600">{description}</div>

          {warnings.length > 0 ? (
            <ul className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
              {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2 text-sm text-amber-900">
                  <span aria-hidden="true" className="mt-0.5 shrink-0">
                    •
                  </span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
            >
              {isSubmitting ? 'Cancel request' : cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              className={`min-h-11 ${confirmClass}`}
            >
              {isSubmitting ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
