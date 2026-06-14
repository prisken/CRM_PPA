"use client";

import { formatTimestamp, getClientDisplayName } from "@/lib/client-types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DealItem = {
  id: string;
  title: string;
  description: string | null;
  value: string | null;
  status: string;
  createdAt: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    company: string | null;
  };
};

export default function DealsList() {
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/deals");

      if (!response.ok) {
        throw new Error("Failed to load deals");
      }

      setDeals(await response.json());
    } catch {
      setError("Unable to load deals.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  if (isLoading) {
    return <p className="text-sm text-content-secondary">Loading deals...</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 shadow-card">
        <p className="text-sm text-content-secondary">No deals yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {deals.map((deal) => (
        <article key={deal.id} className="rounded-xl bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-content">
                {deal.title}
              </h2>
              <Link
                href={`/clients/${deal.client.id}`}
                className="mt-1 inline-block text-sm text-accent hover:text-accent-hover"
              >
                {getClientDisplayName(deal.client)}
              </Link>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase text-content-secondary">
              {deal.status.replaceAll("_", " ")}
            </span>
          </div>
          {deal.description && (
            <p className="mt-3 text-sm text-content-secondary">
              {deal.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-content-muted">
            {deal.value && <span>Value: ${deal.value}</span>}
            <span>Created {formatTimestamp(deal.createdAt)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
