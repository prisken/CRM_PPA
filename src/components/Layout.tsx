import AuthButtons from "@/components/AuthButtons";
import Link from "next/link";
import {
  Handshake,
  KanbanSquare,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Users,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/deals", label: "Deals", icon: Handshake },
  { href: "/strategies", label: "Strategies", icon: Lightbulb },
  { href: "/interactions", label: "Interactions", icon: MessageSquare },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full bg-slate-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-soft">
        <div className="border-b border-slate-200/80 px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
            CRM PPA
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-content">
            Workspace
          </h1>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-4">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-slate-100 hover:text-content"
            >
              <Icon className="h-4 w-4 shrink-0 text-content-muted" />
              {label}
            </Link>
          ))}
        </nav>

        <AuthButtons />
      </aside>

      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
