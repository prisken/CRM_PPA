'use client';

import { useEffect, useState } from 'react';

type MySecuredCommissionWidgetProps = {
  amount: number;
  error?: string | null;
};

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function MySecuredCommissionWidget({
  amount,
  error = null,
}: MySecuredCommissionWidgetProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">My Secured Commission</h2>

      {error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : (
        <>
          <p className="mt-4 text-4xl font-bold text-gray-900">{formatMoney(amount)}</p>
          <p className="mt-2 text-sm text-gray-500">
            Based on WON deals across your assigned clients
          </p>
        </>
      )}
    </section>
  );
}
