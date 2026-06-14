"use client";

import ClientsList from "@/components/ClientsList";
import NewClientButton from "@/components/NewClientButton";
import { useState } from "react";

export default function ClientsPageContent() {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">
            Clients
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            View and manage all client profiles.
          </p>
        </div>
        <NewClientButton
          redirectToClient={false}
          onCreated={() => setRefreshToken((value) => value + 1)}
        />
      </div>

      <ClientsList refreshToken={refreshToken} />
    </div>
  );
}
