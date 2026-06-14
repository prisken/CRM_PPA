import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const { error, status } = await requireAuth();

  if (error) {
    return NextResponse.json({ error }, { status: status! });
  }

  const deals = await prisma.deal.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: {
        select: { id: true, firstName: true, lastName: true, company: true },
      },
    },
  });

  return NextResponse.json(
    deals.map((deal) => ({
      id: deal.id,
      title: deal.title,
      description: deal.description,
      value: deal.value?.toString() ?? null,
      status: deal.status,
      createdAt: deal.createdAt.toISOString(),
      client: deal.client,
    })),
  );
}
