import { ClientStatus, UserRole } from "@/generated/prisma/client";
import { requireAuth, withAuthorization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const validStatuses = new Set<string>(Object.values(ClientStatus));

type RouteContext = {
  params: Promise<{ id: string }>;
};

const specialistLabels = {
  assignedAdmin: "Admin",
  assignedRelationshipSpecialist: "Relationship Specialist",
  assignedDoctor: "Doctor",
  assignedServiceSpecialist: "Service Specialist",
} as const;

export async function GET(_request: Request, context: RouteContext) {
  const { error, status } = await requireAuth();

  if (error) {
    return NextResponse.json({ error }, { status: status! });
  }

  const { id } = await context.params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      assignedAdmin: { select: { id: true, name: true, role: true } },
      assignedRelationshipSpecialist: {
        select: { id: true, name: true, role: true },
      },
      assignedDoctor: { select: { id: true, name: true, role: true } },
      assignedServiceSpecialist: {
        select: { id: true, name: true, role: true },
      },
      interactions: {
        orderBy: { occurredAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
        },
      },
      deals: { orderBy: { createdAt: "desc" } },
      strategies: { orderBy: { lastModified: "desc" } },
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const specialists = (
    [
      ["assignedAdmin", client.assignedAdmin],
      ["assignedRelationshipSpecialist", client.assignedRelationshipSpecialist],
      ["assignedDoctor", client.assignedDoctor],
      ["assignedServiceSpecialist", client.assignedServiceSpecialist],
    ] as const
  )
    .filter(
      (
        entry,
      ): entry is [keyof typeof specialistLabels, NonNullable<(typeof entry)[1]>] =>
        Boolean(entry[1]),
    )
    .map(([key, user]) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      label: specialistLabels[key],
    }));

  return NextResponse.json({
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    company: client.company,
    email: client.email,
    phone: client.phone,
    status: client.status,
    pendingNotifications: client.pendingNotifications,
    specialists,
    interactions: client.interactions.map((interaction) => ({
      id: interaction.id,
      type: interaction.type,
      title: interaction.title,
      notes: interaction.notes,
      occurredAt: interaction.occurredAt.toISOString(),
      user: interaction.user,
    })),
    deals: client.deals.map((deal) => ({
      id: deal.id,
      title: deal.title,
      description: deal.description,
      value: deal.value?.toString() ?? null,
      status: deal.status,
      createdAt: deal.createdAt.toISOString(),
    })),
    notes: client.strategies.map((strategy) => ({
      id: strategy.id,
      title: strategy.title,
      description: strategy.description,
      status: strategy.status,
      lastModified: strategy.lastModified.toISOString(),
    })),
  });
}

export const PUT = withAuthorization<RouteContext>(
  [UserRole.ADMIN, UserRole.RELATIONSHIP],
  async (request, context) => {
    const { id } = await context.params;
    const body = await request.json();
    const { status: clientStatus } = body;

    if (!clientStatus || !validStatuses.has(clientStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const client = await prisma.client.update({
      where: { id },
      data: {
        status: clientStatus as ClientStatus,
        pendingNotifications: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        status: true,
        pendingNotifications: true,
      },
    });

    return NextResponse.json(client);
  },
);

export const DELETE = withAuthorization<RouteContext>(
  [UserRole.ADMIN],
  async (_request, context) => {
    const { id } = await context.params;

    await prisma.client.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  },
);
