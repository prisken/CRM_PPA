"use client";

import {
  formatTimestamp,
  getClientDisplayName,
  getInteractionText,
} from "@/lib/client-types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type InteractionItem = {
  id: string;
  type: string;
  title: string | null;
  notes: string | null;
  occurredAt: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    company: string | null;
  };
  user: {
    id: string;
    name: string | null;
  };
};

export default function InteractionsList() {
  const [interactions, setInteractions] = useState<InteractionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInteractions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/interactions");

      if (!response.ok) {
        throw new Error("Failed to load interactions");
      }

      setInteractions(await response.json());
    } catch {
      setError("Unable to load interactions.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInteractions();
  }, [fetchInteractions]);

  if (isLoading) {
    return (
      <p className="text-sm text-content-secondary">Loading interactions...</p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 shadow-card">
        <p className="text-sm text-content-secondary">No interactions yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {interactions.map((interaction) => (
        <article
          key={interaction.id}
          className="rounded-xl bg-white p-5 shadow-card"
        >
          <p className="text-sm leading-6 text-content">
            {getInteractionText(interaction)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
            <Link
              href={`/clients/${interaction.client.id}`}
              className="font-medium text-accent hover:text-accent-hover"
            >
              {getClientDisplayName(interaction.client)}
            </Link>
            <span>{interaction.user.name || "Unknown user"}</span>
            <span>{formatTimestamp(interaction.occurredAt)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 uppercase">
              {interaction.type}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
