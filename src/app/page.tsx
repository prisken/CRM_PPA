import DashboardActions from "@/components/DashboardActions";

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="rounded-xl bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          Dashboard
        </h1>
        <p className="mt-2 text-content-secondary">
          Welcome to your CRM workspace. Use the sidebar to navigate clients,
          deals, strategies, and interactions.
        </p>
        <DashboardActions />
      </div>
    </div>
  );
}
