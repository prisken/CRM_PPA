'use client';

import { DealParticipantRole, DealType } from '@prisma/client';
import Link from 'next/link';
import { memo } from 'react';
import CompactPill, { type CompactPillTone } from '@/components/ui/CompactPill';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getWidgetPaddingClass } from '@/components/ui/displayDensity';
import {
  DEAL_PARTICIPANT_ROLE_LABELS,
  DEAL_TYPE_LABELS,
} from '@/lib/dealCommissionTemplates';
import type { DealParticipationRow } from '@/lib/dashboardTypes';

const moneyFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`;
}

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dealStatusTone(status: string): CompactPillTone {
  switch (status) {
    case 'WON':
      return 'green';
    case 'PROPOSED':
      return 'blue';
    case 'LOST':
      return 'red';
    case 'ON_HOLD':
      return 'yellow';
    default:
      return 'gray';
  }
}

function formatRoleLabel(role: string) {
  if (Object.values(DealParticipantRole).includes(role as DealParticipantRole)) {
    return DEAL_PARTICIPANT_ROLE_LABELS[role as DealParticipantRole];
  }

  return role;
}

function formatDealTypeLabel(dealType: string) {
  if (Object.values(DealType).includes(dealType as DealType)) {
    return DEAL_TYPE_LABELS[dealType as DealType];
  }

  return dealType;
}

type MyDealParticipationWidgetProps = {
  deals: DealParticipationRow[];
  error?: string | null;
};

function MyDealParticipationWidget({
  deals,
  error = null,
}: MyDealParticipationWidgetProps) {
  const { density } = useDisplayDensity();
  const widgetPaddingClass = getWidgetPaddingClass(density);

  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-sm ${widgetPaddingClass}`}>
      <h2 className="text-sm font-semibold text-gray-900">My Deal Participation</h2>
      <p className="mt-1 text-xs text-gray-500">
        Deals where you are a deal participant (commission split).
      </p>

      {error ? (
        <p className="mt-2.5 text-sm text-red-600">{error}</p>
      ) : deals.length === 0 ? (
        <p className="mt-2.5 text-sm text-gray-500">No deal participation yet.</p>
      ) : (
        <div className="mt-2.5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-2 py-1.5 font-medium">Deal</th>
                <th className="px-2 py-1.5 font-medium">Client</th>
                <th className="px-2 py-1.5 font-medium">Type</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">My roles</th>
                <th className="px-2 py-1.5 font-medium">My %</th>
                <th className="px-2 py-1.5 font-medium">My commission</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr
                  key={deal.dealId}
                  className="border-b border-gray-100 transition hover:bg-blue-50 active:bg-blue-100"
                >
                  <td className="min-w-[8rem] px-2 py-2">
                    <Link
                      href={`/clients/${deal.clientId}`}
                      className="block truncate font-medium text-blue-600 hover:underline"
                      title={deal.dealName}
                    >
                      {deal.dealName}
                    </Link>
                  </td>
                  <td className="min-w-[8rem] px-2 py-2">
                    <Link
                      href={`/clients/${deal.clientId}`}
                      className="block truncate text-gray-700 hover:text-blue-600 hover:underline"
                      title={deal.clientName}
                    >
                      {deal.clientName}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-gray-700">
                    {formatDealTypeLabel(deal.dealType)}
                  </td>
                  <td className="px-2 py-2">
                    <CompactPill tone={dealStatusTone(deal.status)} size="xs">
                      {formatStatusLabel(deal.status)}
                    </CompactPill>
                  </td>
                  <td className="px-2 py-2 text-gray-700">
                    {deal.myRoles.map(formatRoleLabel).join(', ')}
                  </td>
                  <td className="px-2 py-2 text-gray-700">
                    {formatPercent(deal.myCommissionPercent)}
                  </td>
                  <td className="px-2 py-2 font-medium text-gray-900">
                    {formatMoney(deal.myCommissionAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default memo(MyDealParticipationWidget);
