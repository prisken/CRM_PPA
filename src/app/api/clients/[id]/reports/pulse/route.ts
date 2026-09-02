import { NextResponse } from 'next/server';
import { DealStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clients/[id]/reports/pulse
 * Assembles the Monthly Pulse report content for a client.
 * Client-facing only: policy name/type/value and dates — NEVER commission,
 * cost prices, or internal fields (revamp brief: no internal data on PDFs).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return auth.error;
  const { canReadClientCore } = await import('@/lib/authHelpers');
  const allowed = await canReadClientCore(auth.user.id, auth.user.role, id);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true, name: true, company: true, status: true,
      contacts: { orderBy: [{ isPrimary: 'desc' as const }], take: 1, select: { value: true } },
      deals: {
        where: { status: DealStatus.WON },
        orderBy: { createdAt: 'asc' as const },
        select: { name: true, dealValue: true, dealType: true, createdAt: true },
      },
      importantDateRecords: {
        where: { scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' as const },
        take: 10,
        select: { id: true, label: true, scheduledAt: true },
      },
      tasks: {
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        orderBy: { dueDate: 'asc' as const },
        take: 5,
        select: { id: true, title: true, dueDate: true },
      },
      interactions: {
        orderBy: { date: 'desc' as const },
        take: 1,
        select: { date: true, type: true, content: true },
      },
      nextAction: true,
      nextFollowUpAt: true,
    },
  });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // client-safe numbers only
  const policies = client.deals.map((d) => ({
    name: d.name,
    type: d.dealType,
    value: d.dealValue !== null ? Number(d.dealValue) : null,
    since: d.createdAt.toISOString().slice(0, 7),
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    client: {
      name: client.name,
      company: client.company,
      contact: client.contacts[0]?.value ?? null,
      status: client.status,
    },
    policies,
    upcoming: client.importantDateRecords.map((d) => ({
      label: d.label,
      when: d.scheduledAt.toISOString(),
    })),
    open_tasks: client.tasks.map((t) => ({
      title: t.title,
      due: t.dueDate ? t.dueDate.toISOString() : null,
    })),
    last_interaction: client.interactions[0]
      ? {
          date: client.interactions[0].date.toISOString(),
          content: client.interactions[0].content,
        }
      : null,
    next_action: client.nextAction,
    next_follow_up: client.nextFollowUpAt
      ? client.nextFollowUpAt.toISOString()
      : null,
  });
}
