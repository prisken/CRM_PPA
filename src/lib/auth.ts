import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { Session } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(
          credentials.password,
          user.password,
        );

        if (!passwordMatches) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }

      return session;
    },
  },
};

export async function getSession() {
  return getServerSession(authOptions);
}

export async function getRequiredSession() {
  const session = await getSession();

  if (!session?.user?.id) {
    return null;
  }

  return session;
}

export function isSuperAdmin(session: Session | null | undefined): boolean {
  return session?.user?.role === UserRole.SUPER_ADMIN;
}

export async function requireAuth() {
  const session = await getRequiredSession();

  if (!session) {
    return { error: "Unauthorized", status: 401 as const, session: null };
  }

  return { session, error: null, status: null };
}

export async function requireSuperAdmin() {
  const authResult = await requireAuth();

  if (authResult.error) {
    return authResult;
  }

  if (!isSuperAdmin(authResult.session)) {
    return { error: "Forbidden", status: 403 as const, session: null };
  }

  return { session: authResult.session, error: null, status: null };
}

type ApiRouteHandler<TContext = unknown> = (
  request: Request,
  context: TContext,
) => Promise<Response> | Response;

type AuthorizedApiRouteHandler<TContext = unknown> = (
  request: Request,
  context: TContext,
  session: Session,
) => Promise<Response> | Response;

export function withAuthorization<TContext = unknown>(
  allowedRoles: UserRole[],
  handler: AuthorizedApiRouteHandler<TContext>,
): ApiRouteHandler<TContext> {
  return async (request, context) => {
    const session = await getRequiredSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return handler(request, context, session);
  };
}
