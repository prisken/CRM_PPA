'use client';

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
  if (!isOpen) {
    return null;
  }

  const confirmClass =
    tone === 'danger'
      ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60'
      : 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-md max-h-[min(90dvh,40rem)] overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
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
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {isSubmitting ? 'Cancel request' : cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              className={confirmClass}
            >
              {isSubmitting ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
