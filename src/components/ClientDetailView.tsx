"use client";

import {
  ClientDetail,
  formatTimestamp,
  getClientDisplayName,
  getInteractionText,
} from "@/lib/client-types";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import {
  Bell,
  Handshake,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type TabId = "interactions" | "deals" | "notes";

const tabs: { id: TabId; label: string; icon: typeof MessageSquare }[] = [
  { id: "interactions", label: "Interactions", icon: MessageSquare },
  { id: "deals", label: "Deals", icon: Handshake },
  { id: "notes", label: "Notes", icon: StickyNote },
];

export default function ClientDetailView({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { isAdmin, isLoading: isUserLoading } = useCurrentUser();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("interactions");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchClient = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}`);

      if (!response.ok) {
        throw new Error("Failed to load client");
      }

      const data: ClientDetail = await response.json();
      setClient(data);
    } catch {
      setError("Unable to load client details.");
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  async function handleNotifyTeam() {
    if (!client) {
      return;
    }

    setIsNotifying(true);

    try {
      const response = await fetch(`/api/clients/${clientId}/notify`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to notify team");
      }

      setClient((current) =>
        current ? { ...current, pendingNotifications: false } : current,
      );
    } catch {
      setError("Failed to notify the team. Please try again.");
    } finally {
      setIsNotifying(false);
    }
  }

  async function handleDeleteClient() {
    if (!client) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${getClientDisplayName(client)}? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete client");
      }

      router.push("/clients");
      router.refresh();
    } catch {
      setError("Failed to delete client. Please try again.");
      setIsDeleting(false);
    }
  }

  if (isLoading || isUserLoading) {
    return (
      <p className="text-sm text-content-secondary">Loading client details...</p>
    );
  }

  if (error || !client) {
    return (
      <div className="rounded-xl bg-white p-8 shadow-card">
        <p className="text-sm text-red-600">
          {error ?? "Client not found."}
        </p>
        <Link
          href="/pipeline"
          className="mt-4 inline-block text-sm font-medium text-accent hover:text-accent-hover"
        >
          Back to pipeline
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="rounded-xl bg-white p-8 shadow-card">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-content-muted">
                {client.company || "Client profile"}
              </p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight text-content">
                {getClientDisplayName(client)}
              </h1>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 text-sm text-content-secondary">
                <Mail className="h-4 w-4 text-content-muted" />
                <span>{client.email || "No email provided"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-content-secondary">
                <Phone className="h-4 w-4 text-content-muted" />
                <span>{client.phone || "No phone provided"}</span>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-content-muted">
                Assigned PPA Specialists
              </h2>
              {client.specialists.length > 0 ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {client.specialists.map((specialist) => (
                    <li
                      key={specialist.id}
                      className="flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-3"
                    >
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-content-muted" />
                      <div>
                        <p className="text-sm font-medium text-content">
                          {specialist.name || "Unnamed specialist"}
                        </p>
                        <p className="text-xs text-content-secondary">
                          {specialist.label}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-content-secondary">
                  No specialists assigned yet.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {client.pendingNotifications && (
              <button
                type="button"
                onClick={handleNotifyTeam}
                disabled={isNotifying}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Bell className="h-4 w-4" />
                {isNotifying ? "Notifying..." : "Notify Team of Changes"}
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={handleDeleteClient}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? "Deleting..." : "Delete Client"}
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-xl bg-white shadow-card">
        <div className="border-b border-slate-200/80 px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-2 border-b-2 px-4 py-4 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-accent text-accent"
                      : "border-transparent text-content-secondary hover:text-content"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {activeTab === "interactions" && (
            <div className="space-y-4">
              {client.interactions.length > 0 ? (
                client.interactions.map((interaction) => (
                  <article
                    key={interaction.id}
                    className="rounded-xl border border-slate-200/80 px-5 py-4"
                  >
                    <p className="text-sm leading-6 text-content">
                      {getInteractionText(interaction)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
                      <span>
                        {interaction.user.name || "Unknown user"}
                      </span>
                      <span>{formatTimestamp(interaction.occurredAt)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 uppercase">
                        {interaction.type}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-content-secondary">
                  No interactions recorded yet.
                </p>
              )}
            </div>
          )}

          {activeTab === "deals" && (
            <div className="space-y-4">
              {client.deals.length > 0 ? (
                client.deals.map((deal) => (
                  <article
                    key={deal.id}
                    className="rounded-xl border border-slate-200/80 px-5 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-content">
                        {deal.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase text-content-secondary">
                        {deal.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    {deal.description && (
                      <p className="mt-2 text-sm leading-6 text-content-secondary">
                        {deal.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-content-muted">
                      {deal.value && <span>Value: ${deal.value}</span>}
                      <span>Created {formatTimestamp(deal.createdAt)}</span>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-content-secondary">
                  No deals recorded yet.
                </p>
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="space-y-4">
              {client.notes.length > 0 ? (
                client.notes.map((note) => (
                  <article
                    key={note.id}
                    className="rounded-xl border border-slate-200/80 px-5 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-content">
                        {note.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase text-content-secondary">
                        {note.status}
                      </span>
                    </div>
                    {note.description && (
                      <p className="mt-2 text-sm leading-6 text-content-secondary">
                        {note.description}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-content-muted">
                      Updated {formatTimestamp(note.lastModified)}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-content-secondary">
                  No notes recorded yet.
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
