"use client";

import { formatTimestamp, getClientDisplayName } from "@/lib/client-types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type StrategyItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  lastModified: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    company: string | null;
  };
};

export default function StrategiesList() {
  const [strategies, setStrategies] = useState<StrategyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStrategies = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/strategies");

      if (!response.ok) {
        throw new Error("Failed to load strategies");
      }

      setStrategies(await response.json());
    } catch {
      setError("Unable to load strategies.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  if (isLoading) {
    return (
      <p className="text-sm text-content-secondary">Loading strategies...</p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 shadow-card">
        <p className="text-sm text-content-secondary">No strategies yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {strategies.map((strategy) => (
        <article
          key={strategy.id}
          className="rounded-xl bg-white p-5 shadow-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-content">
                {strategy.title}
              </h2>
              <Link
                href={`/clients/${strategy.client.id}`}
                className="mt-1 inline-block text-sm text-accent hover:text-accent-hover"
              >
                {getClientDisplayName(strategy.client)}
              </Link>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase text-content-secondary">
              {strategy.status}
            </span>
          </div>
          {strategy.description && (
            <p className="mt-3 text-sm text-content-secondary">
              {strategy.description}
            </p>
          )}
          <p className="mt-3 text-xs text-content-muted">
            Updated {formatTimestamp(strategy.lastModified)}
          </p>
        </article>
      ))}
    </div>
  );
}
