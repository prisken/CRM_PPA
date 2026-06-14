"use client";

import { UserRole } from "@/generated/prisma/enums";
import { useSession } from "next-auth/react";

export function useCurrentUser() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  return {
    session,
    status,
    user: session?.user ?? null,
    role: role ?? null,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    isSuperAdmin: role === UserRole.SUPER_ADMIN,
    isAdmin: role === UserRole.ADMIN,
    isRelationshipSpecialist: role === UserRole.RELATIONSHIP,
    isDoctor: role === UserRole.DOCTOR,
    isServiceSpecialist: role === UserRole.SERVICE,
  };
}
