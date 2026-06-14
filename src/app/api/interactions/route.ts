import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const { error, status } = await requireAuth();

  if (error) {
    return NextResponse.json({ error }, { status: status! });
  }

  const interactions = await prisma.interaction.findMany({
    orderBy: { occurredAt: "desc" },
    include: {
      client: {
        select: { id: true, firstName: true, lastName: true, company: true },
      },
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(
    interactions.map((interaction) => ({
      id: interaction.id,
      type: interaction.type,
      title: interaction.title,
      notes: interaction.notes,
      occurredAt: interaction.occurredAt.toISOString(),
      client: interaction.client,
      user: interaction.user,
    })),
  );
}
