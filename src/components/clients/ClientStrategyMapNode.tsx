'use client';

import { memo } from 'react';
import CompactPill from '@/components/ui/CompactPill';
import type {
  ClientStrategyMapNode as ClientStrategyMapNodeModel,
  ClientStrategyMapNodeKind,
} from '@/lib/clientStrategyReportHelpers';

const KIND_PILL_TONE: Record<
  ClientStrategyMapNodeKind,
  'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'gray'
> = {
  goal: 'blue',
  initial_investment: 'green',
  income_checkpoint: 'yellow',
  maturity_scenario: 'purple',
  exit_scenario: 'orange',
  custom_review: 'gray',
  outcome: 'blue',
};

const KIND_ACCENT: Record<ClientStrategyMapNodeKind, string> = {
  goal: 'border-l-blue-400',
  initial_investment: 'border-l-green-400',
  income_checkpoint: 'border-l-amber-400',
  maturity_scenario: 'border-l-violet-400',
  exit_scenario: 'border-l-orange-400',
  custom_review: 'border-l-gray-400',
  outcome: 'border-l-blue-500',
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function displayMoney(value: number | null | undefined) {
  return formatMoney(value) ?? '—';
}

type ClientStrategyMapNodeProps = {
  node: ClientStrategyMapNodeModel;
  stepLabel?: number;
};

function ClientStrategyMapNode({ node, stepLabel }: ClientStrategyMapNodeProps) {
  const hasPrimary =
    node.primaryMetricLabel !== null && node.primaryMetricValue !== null;
  const hasSecondary =
    node.secondaryMetricLabel !== null && node.secondaryMetricValue !== null;

  return (
    <article
      className={`flex h-full min-w-0 flex-col rounded-xl border border-gray-200 border-l-4 bg-white p-3.5 shadow-sm print:break-inside-avoid print:shadow-none ${KIND_ACCENT[node.kind]}`}
      aria-label={
        stepLabel
          ? `Step ${stepLabel}, ${node.label}: ${node.title}`
          : `${node.label}: ${node.title}`
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {stepLabel ? (
          <span
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600"
          >
            {stepLabel}
          </span>
        ) : null}
        <CompactPill tone={KIND_PILL_TONE[node.kind]} size="xs">
          {node.label}
        </CompactPill>
        {node.year !== null ? (
          <span className="text-xs font-medium text-gray-600">
            Year <span className="font-semibold text-gray-800">{node.year}</span>
          </span>
        ) : null}
      </div>

      <h4 className="mt-2 text-sm font-semibold leading-snug text-gray-900">
        {node.title}
      </h4>

      {node.subtitle ? (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{node.subtitle}</p>
      ) : null}

      {hasPrimary ? (
        <div className="mt-2.5 rounded-lg bg-gray-50 px-2.5 py-2 print:bg-white">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {node.primaryMetricLabel}
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
            {displayMoney(node.primaryMetricValue)}
          </p>
        </div>
      ) : null}

      {hasSecondary ? (
        <p className="mt-2 text-xs tabular-nums text-gray-600">
          <span className="font-medium text-gray-700">
            {node.secondaryMetricLabel}:
          </span>{' '}
          {displayMoney(node.secondaryMetricValue)}
        </p>
      ) : null}

      {node.benefitText ? (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600">
          {node.benefitText}
        </p>
      ) : null}

      {node.linkedStepChips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {node.linkedStepChips.map((chip) => (
            <CompactPill key={chip.id} tone="gray" size="xs" title={chip.title}>
              Linked: {chip.title}
            </CompactPill>
          ))}
        </div>
      ) : null}

      {node.notesPreview ? (
        <p className="mt-2 line-clamp-2 border-t border-gray-100 pt-2 text-[11px] leading-relaxed text-gray-500">
          <span className="font-medium text-gray-600">Note: </span>
          {node.notesPreview}
        </p>
      ) : null}
    </article>
  );
}

export default memo(ClientStrategyMapNode);
