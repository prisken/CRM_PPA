import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const { error, status } = await requireAuth();

  if (error) {
    return NextResponse.json({ error }, { status: status! });
  }

  const strategies = await prisma.strategy.findMany({
    orderBy: { lastModified: "desc" },
    include: {
      client: {
        select: { id: true, firstName: true, lastName: true, company: true },
      },
    },
  });

  return NextResponse.json(
    strategies.map((strategy) => ({
      id: strategy.id,
      title: strategy.title,
      description: strategy.description,
      status: strategy.status,
      lastModified: strategy.lastModified.toISOString(),
      client: strategy.client,
    })),
  );
}
