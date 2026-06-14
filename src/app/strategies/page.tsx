import StrategiesList from "@/components/StrategiesList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strategies | CRM PPA",
};

export default function StrategiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          Strategies
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          Review planning notes and strategy documents.
        </p>
      </div>

      <StrategiesList />
    </div>
  );
}
