import DealsList from "@/components/DealsList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deals | CRM PPA",
};

export default function DealsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          Deals
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          Track opportunities across your client portfolio.
        </p>
      </div>

      <DealsList />
    </div>
  );
}
