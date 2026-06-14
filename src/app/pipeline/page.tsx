import KanbanBoard from "@/components/KanbanBoard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pipeline | CRM PPA",
};

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          Pipeline
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          Drag clients across stages to update their status.
        </p>
      </div>

      <KanbanBoard />
    </div>
  );
}
