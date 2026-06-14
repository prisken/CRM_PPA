'use client';

type DealInfoWidgetProps = {
  dealValue: number;
  grossProfit: number;
  canEdit?: boolean;
};

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function MetricField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

export default function DealInfoWidget({
  dealValue,
  grossProfit,
  canEdit = false,
}: DealInfoWidgetProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Deal Info</h3>
        {canEdit && (
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
        )}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <MetricField label="Deal Value" value={formatMoney(dealValue)} />
        <MetricField label="Gross Profit" value={formatMoney(grossProfit)} />
      </dl>
    </div>
  );
}
