import InteractionsList from "@/components/InteractionsList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Interactions | CRM PPA",
};

export default function InteractionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          Interactions
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          Browse the full interaction history across clients.
        </p>
      </div>

      <InteractionsList />
    </div>
  );
}
