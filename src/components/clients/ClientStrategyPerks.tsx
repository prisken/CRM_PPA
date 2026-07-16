'use client';

import { memo } from 'react';
import type { ClientStrategyPerk } from '@/lib/clientStrategyReportHelpers';

type ClientStrategyPerksProps = {
  perks: ClientStrategyPerk[];
  hasMilestones?: boolean;
};

function ClientStrategyPerks({
  perks,
  hasMilestones = true,
}: ClientStrategyPerksProps) {
  if (perks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3 py-4 text-sm text-gray-600">
        {hasMilestones ? (
          <p>
            Perks will appear here as your advisor adds milestones and strategy
            steps to the plan.
          </p>
        ) : (
          <p>
            This overview shows your goal and expected outcome. Your advisor can
            add milestones and strategy steps to highlight more plan benefits
            here.
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {perks.map((perk) => (
        <li
          key={perk.id}
          className="flex gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 print:break-inside-avoid"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600"
          >
            ✓
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{perk.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
              {perk.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default memo(ClientStrategyPerks);
