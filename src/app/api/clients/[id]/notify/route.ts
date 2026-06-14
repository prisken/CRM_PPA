import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { error, status } = await requireAuth();

  if (error) {
    return NextResponse.json({ error }, { status: status! });
  }

  const { id } = await context.params;

  const client = await prisma.client.update({
    where: { id },
    data: { pendingNotifications: false },
    select: {
      id: true,
      pendingNotifications: true,
    },
  });

  return NextResponse.json(client);
}
