"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type NewClientButtonProps = {
  onCreated?: (clientId: string) => void;
  redirectToClient?: boolean;
  className?: string;
};

export default function NewClientButton({
  onCreated,
  redirectToClient = true,
  className = "rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-accent-hover",
}: NewClientButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setFirstName("");
    setLastName("");
    setCompany("");
    setEmail("");
    setPhone("");
    setError(null);
  }

  function closeModal() {
    setIsOpen(false);
    resetForm();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          company,
          email,
          phone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create client.");
      }

      closeModal();
      onCreated?.(data.id);

      if (redirectToClient) {
        router.push(`/clients/${data.id}`);
        router.refresh();
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create client.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={className}>
        New Client
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div
            className="absolute inset-0"
            onClick={closeModal}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-elevated">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-content">
                  New Client
                </h2>
                <p className="mt-1 text-sm text-content-secondary">
                  Add a client to the pipeline as a new lead.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1 text-content-muted transition-colors hover:bg-slate-100 hover:text-content"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="firstName"
                    className="mb-1.5 block text-sm font-medium text-content"
                  >
                    First name
                  </label>
                  <input
                    id="firstName"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-content outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="lastName"
                    className="mb-1.5 block text-sm font-medium text-content"
                  >
                    Last name
                  </label>
                  <input
                    id="lastName"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-content outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="company"
                  className="mb-1.5 block text-sm font-medium text-content"
                >
                  Company
                </label>
                <input
                  id="company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-content outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-content"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-content outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1.5 block text-sm font-medium text-content"
                  >
                    Phone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-content outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-slate-100 hover:text-content"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Creating..." : "Create Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
