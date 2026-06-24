'use client';

import Link from 'next/link';
import { memo, useMemo, useState } from 'react';
import type { AssignedClientRow } from '@/lib/dashboardTypes';

const moneyFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

const ClientTableRow = memo(function ClientTableRow({
  client,
}: {
  client: AssignedClientRow;
}) {
  return (
    <tr className="cursor-pointer border-b border-gray-100 transition hover:bg-blue-50">
      <td className="px-3 py-3">
        <Link
          href={`/clients/${client.clientId}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {client.clientName}
        </Link>
      </td>
      <td className="px-3 py-3 text-gray-700">{client.myRole}</td>
      <td className="px-3 py-3 text-gray-700">{client.clientStatus}</td>
      <td className="px-3 py-3 font-medium text-gray-900">
        {formatMoney(client.dealValue)}
      </td>
    </tr>
  );
});

type MyClientsWidgetProps = {
  assignedClients: AssignedClientRow[];
  error?: string | null;
};

function MyClientsWidget({
  assignedClients,
  error = null,
}: MyClientsWidgetProps) {
  const [search, setSearch] = useState('');

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return assignedClients;
    }

    return assignedClients.filter((client) =>
      client.clientName.toLowerCase().includes(query)
    );
  }, [assignedClients, search]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">My Assigned Clients</h2>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search clients by name..."
        className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      {error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : filteredClients.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No clients match your search.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Client Name</th>
                <th className="px-3 py-2 font-medium">My Role</th>
                <th className="px-3 py-2 font-medium">Client Status</th>
                <th className="px-3 py-2 font-medium">Deal Value</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <ClientTableRow key={client.clientId} client={client} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default memo(MyClientsWidget);
