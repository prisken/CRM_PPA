import { NextResponse } from 'next/server';
import { DealStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clients/[id]/reports/review
 * Quarterly Policy Review data — the pre-meeting pack.
 * Client-safe only: policies (WON deals), goals, coverage, discussion items.
 * NEVER commission / cost / internal fields (revamp brief).
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
      id: true, name: true, company: true, status: true, expectations: true, strategyText: true,
      contacts: { orderBy: [{ isPrimary: 'desc' as const }], take: 1, select: { value: true } },
      deals: {
        orderBy: { createdAt: 'asc' as const },
        select: { name: true, dealValue: true, dealType: true, status: true, createdAt: true },
      },
      importantDateRecords: {
        where: { scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' as const },
        take: 12,
        select: { id: true, label: true, scheduledAt: true },
      },
      tasks: {
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        orderBy: { dueDate: 'asc' as const },
        take: 8,
        select: { id: true, title: true, dueDate: true },
      },
      interactions: {
        orderBy: { date: 'desc' as const },
        take: 3,
        select: { date: true, type: true, content: true },
      },
      strategyPlans: {
        where: { status: { in: ['ACTIVE', 'DRAFT'] } },
        orderBy: { updatedAt: 'desc' as const },
        take: 1,
        select: { title: true, clientGoal: true, expectedOutcome: true, description: true },
      },
      nextAction: true,
      nextFollowUpAt: true,
    },
  });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const WON = DealStatus.WON;
  const policies = client.deals
    .filter((d) => d.status === WON)
    .map((d) => ({
      name: d.name, type: d.dealType,
      value: d.dealValue !== null ? Number(d.dealValue) : null,
      since: d.createdAt.toISOString().slice(0, 7),
    }));
  const in_discussion = client.deals
    .filter((d) => d.status === 'PROPOSED' || d.status === 'ON_HOLD')
    .map((d) => ({ name: d.name, type: d.dealType, status: d.status }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    client: {
      name: client.name, company: client.company,
      contact: client.contacts[0]?.value ?? null, status: client.status,
    },
    plan: client.strategyPlans[0]
      ? {
          title: client.strategyPlans[0].title,
          goal: client.strategyPlans[0].clientGoal,
          expected: client.strategyPlans[0].expectedOutcome,
        }
      : null,
    notes: client.expectations ?? client.strategyText ?? null,
    policies,
    in_discussion,
    upcoming: client.importantDateRecords.map((d) => ({
      label: d.label, when: d.scheduledAt.toISOString(),
    })),
    open_tasks: client.tasks.map((t) => ({
      title: t.title, due: t.dueDate ? t.dueDate.toISOString() : null,
    })),
    recent_activity: client.interactions.map((i) => ({
      date: i.date.toISOString(), content: i.content,
    })),
    next_action: client.nextAction,
    next_follow_up: client.nextFollowUpAt ? client.nextFollowUpAt.toISOString() : null,
  });
}
