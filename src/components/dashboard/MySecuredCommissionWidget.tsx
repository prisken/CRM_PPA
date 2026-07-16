'use client';

import { useEffect, useState } from 'react';
import { formatMoneyRequired } from '@/lib/formatMoney';

type MySecuredCommissionWidgetProps = {
  amount: number;
  error?: string | null;
};

function formatMoney(value: number) {
  return formatMoneyRequired(value, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

export default function MySecuredCommissionWidget({
  amount,
  error = null,
}: MySecuredCommissionWidgetProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">My Secured Commission</h2>

      {error ? (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      ) : (
        <>
          <p className="mt-3 text-3xl font-bold text-gray-900">{formatMoney(amount)}</p>
          <p className="mt-1 text-xs text-gray-500">WON deals across assigned clients</p>
        </>
      )}
    </section>
  );
}
