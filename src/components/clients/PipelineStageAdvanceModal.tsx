'use client';

import { useState } from 'react';
import { formatClientStage } from '@/lib/clientStages';

type PipelineStageAdvanceModalProps = {
  isOpen: boolean;
  currentStatus: string;
  nextStatus: string;
  checklist: string[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (nextAction: string | null, nextFollowUpAt: string | null) => void;
};

export default function PipelineStageAdvanceModal({
  isOpen,
  currentStatus,
  nextStatus,
  checklist,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: PipelineStageAdvanceModalProps) {
  const [nextAction, setNextAction] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Move to Next Stage</h3>
        <p className="mt-2 text-sm text-gray-600">
          You are about to move this client from{' '}
          <span className="font-medium">{formatClientStage(currentStatus)}</span> to{' '}
          <span className="font-medium">{formatClientStage(nextStatus)}</span>.
        </p>

        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-gray-700">What's the next step?</p>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Send illustration, book needs-analysis, follow up on quote…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <p className="text-sm font-medium text-gray-700">When?</p>
          <input
            type="date"
            value={nextFollowUpAt}
            onChange={(e) => setNextFollowUpAt(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <p className="pt-2 text-sm font-medium text-gray-700">Before you continue, confirm:</p>
          <ul className="mt-3 space-y-2">
            {checklist.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                <span
                  className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-300 bg-gray-50 text-xs text-gray-400"
                  aria-hidden="true"
                >
                  ☐
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                nextAction.trim() || null,
                nextFollowUpAt || null
              )
            }
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Updating...' : 'Confirm & set reminder'}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
