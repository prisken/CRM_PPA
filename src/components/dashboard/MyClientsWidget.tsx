'use client';

import Link from 'next/link';
import { memo, useMemo, useState } from 'react';
import CompactPill from '@/components/ui/CompactPill';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getWidgetPaddingClass } from '@/components/ui/displayDensity';
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
    <tr className="border-b border-gray-100 transition hover:bg-blue-50">
      <td className="min-w-0 px-2 py-2">
        <Link
          href={`/clients/${client.clientId}`}
          className="block truncate font-medium text-blue-600 hover:underline"
          title={client.clientName}
        >
          {client.clientName}
        </Link>
      </td>
      <td className="max-w-[10rem] px-2 py-2 text-gray-700" title={client.myRole}>
        {client.myRole}
      </td>
      <td className="px-2 py-2">
        <CompactPill tone="gray" size="xs" title={client.clientStatus} className="max-w-[8rem]">
          {client.clientStatus}
        </CompactPill>
      </td>
      <td className="px-2 py-2 font-medium text-gray-900">
        {formatMoney(client.dealValue)}
      </td>
    </tr>
  );
});

function ClientTable({
  clients,
  emptyMessage,
}: {
  clients: AssignedClientRow[];
  emptyMessage: string;
}) {
  if (clients.length === 0) {
    return <p className="mt-2.5 text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="mt-2.5 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
            <th className="px-2 py-1.5 font-medium">Client</th>
            <th className="px-2 py-1.5 font-medium">Client role</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 font-medium">Deal value</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <ClientTableRow key={client.clientId} client={client} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type MyClientsWidgetProps = {
  assignedClients: AssignedClientRow[];
  legacyDoctorAssignments?: AssignedClientRow[];
  error?: string | null;
};

function MyClientsWidget({
  assignedClients,
  legacyDoctorAssignments = [],
  error = null,
}: MyClientsWidgetProps) {
  const { density } = useDisplayDensity();
  const widgetPaddingClass = getWidgetPaddingClass(density);
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

  const hasPrimaryAssignments = assignedClients.length > 0;
  const hasLegacyAssignments = legacyDoctorAssignments.length > 0;
  const showSearch = hasPrimaryAssignments || hasLegacyAssignments;

  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-sm ${widgetPaddingClass}`}>
      <h2 className="text-sm font-semibold text-gray-900">My Assigned Clients</h2>
      <p className="mt-1 text-xs text-gray-500">
        Client-level relationship and follow-up officer assignments. Doctor work is tracked per
        deal in My Deal Participation.
      </p>

      {showSearch && (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search clients..."
          className="mt-2.5 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
      )}

      {error ? (
        <p className="mt-2.5 text-sm text-red-600">{error}</p>
      ) : (
        <>
          {!hasPrimaryAssignments && !hasLegacyAssignments ? (
            <p className="mt-2.5 text-sm text-gray-500">
              No relationship or follow-up officer assignments.
            </p>
          ) : (
            <ClientTable
              clients={filteredClients}
              emptyMessage="No clients match your search."
            />
          )}

          {hasLegacyAssignments && (
            <details className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-amber-900">
                Legacy Doctor Assignments ({legacyDoctorAssignments.length})
              </summary>
              <div className="border-t border-amber-100 px-3 py-2">
                <p className="mb-2 text-xs text-amber-800">
                  Doctors are now assigned per deal. Use My Deal Participation for current doctor
                  involvement.
                </p>
                <ClientTable
                  clients={legacyDoctorAssignments}
                  emptyMessage="No legacy doctor assignment rows."
                />
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export default memo(MyClientsWidget);
