"use client";

import { LogIn, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function AuthButtons() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="border-t border-slate-200/80 p-4">
        <p className="text-xs text-content-muted">Loading session...</p>
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="border-t border-slate-200/80 p-4">
        <div className="mb-3 px-1">
          <p className="truncate text-sm font-medium text-content">
            {session.user.name ?? "Signed in user"}
          </p>
          <p className="truncate text-xs text-content-muted">
            {session.user.email}
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-slate-50 hover:text-content"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200/80 p-4">
      <Link
        href="/login"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <LogIn className="h-4 w-4" />
        Log in
      </Link>
    </div>
  );
}
