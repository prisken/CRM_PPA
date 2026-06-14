import NewClientButton from "@/components/NewClientButton";
import Link from "next/link";

export default function DashboardActions() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <NewClientButton />
      <Link
        href="/clients"
        className="rounded-lg px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
      >
        View all clients
      </Link>
    </div>
  );
}
