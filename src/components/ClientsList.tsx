"use client";

import { formatTimestamp, getClientDisplayName } from "@/lib/client-types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ClientListItem = {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  status: string;
  pendingNotifications: boolean;
};

export default function ClientsList({
  refreshToken = 0,
}: {
  refreshToken?: number;
}) {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/clients");

      if (!response.ok) {
        throw new Error("Failed to load clients");
      }

      setClients(await response.json());
    } catch {
      setError("Unable to load clients.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients, refreshToken]);

  if (isLoading) {
    return <p className="text-sm text-content-secondary">Loading clients...</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 shadow-card">
        <p className="text-sm text-content-secondary">No clients yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {clients.map((client) => (
        <Link
          key={client.id}
          href={`/clients/${client.id}`}
          className="rounded-xl bg-white p-5 shadow-card transition-shadow hover:shadow-elevated"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-content">
                {getClientDisplayName(client)}
              </h2>
              <p className="mt-1 text-sm text-content-secondary">
                {client.company || "No company listed"}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase text-content-secondary">
              {client.status.replaceAll("_", " ")}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
