import { ClientStatus, UserRole } from "@/generated/prisma/client";
import { getRequiredSession, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const clientListSelect = {
  id: true,
  firstName: true,
  lastName: true,
  company: true,
  status: true,
  pendingNotifications: true,
} as const;

export async function GET() {
  const session = await getRequiredSession();

  if (!session) {
    return NextResponse.json([]);
  }

  const { id: userId, role } = session.user;

  if (role === UserRole.ADMIN) {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: "asc" },
      select: clientListSelect,
    });

    return NextResponse.json(clients);
  }

  if (
    role === UserRole.RELATIONSHIP ||
    role === UserRole.DOCTOR ||
    role === UserRole.SERVICE
  ) {
    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { assignedRelationshipSpecialistId: userId },
          { assignedDoctorId: userId },
          { assignedServiceSpecialistId: userId },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: clientListSelect,
    });

    return NextResponse.json(clients);
  }

  return NextResponse.json([]);
}

export async function POST(request: Request) {
  const { error, status } = await requireAuth();

  if (error) {
    return NextResponse.json({ error }, { status: status! });
  }

  const body = await request.json();
  const { firstName, lastName, company, email, phone } = body;

  if (!firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json(
      { error: "First name and last name are required." },
      { status: 400 },
    );
  }

  const client = await prisma.client.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company: company?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      status: ClientStatus.NEW_LEAD,
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

  return NextResponse.json(client, { status: 201 });
}
