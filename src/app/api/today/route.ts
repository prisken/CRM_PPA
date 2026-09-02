import { NextResponse } from 'next/server';
import { ClientStatus, TaskStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/today — the "Needs you" ranked queue + my-day strip.
 * Revamp brief §5: promote the attention engine to the CRM home.
 *
 * Returns { needs_you: [...], my_day: [...], counts: {...} }
 * Admin sees all active clients/leads; RO sees assigned ones only.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return auth.error;

  const isAdmin = auth.user.role === 'SUPER_ADMIN';
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  // Clients/leads visible to this user
  const activeStatuses = Object.values(ClientStatus).filter(
    (v) => v !== ClientStatus.ARCHIVED
  );
  const whereBase = isAdmin
    ? { status: { in: activeStatuses } }
    : {
        status: { in: activeStatuses },
        clientAssignments: { some: { userId: auth.user.id } },
      };

  const clients = await prisma.client.findMany({
    where: whereBase,
    select: {
      id: true, name: true, company: true, status: true, priority: true,
      phone: true, email: true, nextAction: true, nextFollowUpAt: true,
      createdAt: true, lastModified: true,
      clientAssignments: { select: { userId: true } },
      interactions: { orderBy: { date: 'desc' }, take: 1, select: { date: true } },
      tasks: {
        where: { status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] } },
        orderBy: { dueDate: 'asc' as const },
        take: 1,
        select: { id: true, title: true, dueDate: true },
      },
      importantDateRecords: {
        where: { scheduledAt: { gte: now } },
        orderBy: { scheduledAt: 'asc' as const },
        take: 1,
        select: { id: true, label: true, scheduledAt: true },
      },
      deals: {
        where: { status: { in: ['PROPOSED', 'WON'] } },
        orderBy: { createdAt: 'asc' as const },
        take: 1,
        select: { id: true, name: true, status: true, dealValue: true },
      },
    },
  });

  const needs_you = [];
  for (const c of clients) {
    const reasons = [];
    let verb = 'Review';
    let dueLabel = '';
    const lastContact = c.interactions[0]?.date ?? null;
    const daysSinceContact = lastContact
      ? Math.floor((now.getTime() - new Date(lastContact).getTime()) / 86400000)
      : null;

    // 1. Overdue task
    if (c.tasks[0]?.dueDate && new Date(c.tasks[0].dueDate) < now) {
      reasons.push(`Overdue task: ${c.tasks[0].title}`);
      verb = 'Complete task';
      dueLabel = 'overdue';
    }
    // 2. Important date within 7 days
    if (c.importantDateRecords[0]) {
      const days = Math.ceil((new Date(c.importantDateRecords[0].scheduledAt).getTime() - now.getTime()) / 86400000);
      if (days <= 7) {
        reasons.push(`${c.importantDateRecords[0].label} in ${days <= 0 ? 'today' : `${days}d`}`);
        verb = 'Prepare';
        if (!dueLabel) dueLabel = days <= 0 ? 'today' : `${days}d`;
      }
    }
    // 3. Unassigned (admin)
    if (isAdmin && c.clientAssignments.length === 0 && !dueLabel) {
      reasons.push('Unassigned');
      verb = 'Assign';
    }
    // 4. Missing phone AND email
    if ((!c.phone || !c.email) && reasons.length < 2) {
      reasons.push('Missing contact info');
      if (verb === 'Review') verb = 'Complete profile';
    }
    // 5. No interaction
    if (daysSinceContact !== null) {
      const threshold = c.status === 'NEW_LEAD' || c.status === 'NURTURING' ? 30 : 7;
      if (daysSinceContact >= threshold && reasons.length < 3) {
        reasons.push(`No contact in ${daysSinceContact}d`);
        if (verb === 'Review') verb = 'Reach out';
      }
    }
    // 6. Open deal with no next step
    if (c.deals[0] && !c.nextFollowUpAt && reasons.length < 3) {
      reasons.push(`Open deal: ${c.deals[0].name}`);
      if (verb === 'Review') verb = 'Advance deal';
    }
    // 7. Next follow-up due
    if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= now && reasons.length < 3) {
      reasons.push('Follow-up due');
      verb = 'Follow up';
    }

    if (reasons.length > 0) {
      needs_you.push({
        client_id: c.id,
        client_name: c.name,
        company: c.company,
        status: c.status,
        why: reasons.slice(0, 2).join(' · '),
        verb,
        due_label: dueLabel || null,
      });
    }
  }

  // Priority sort: overdue first, then by why-count, then recency of modification
  needs_you.sort((a, b) => {
    const score = (x: { due_label: string | null; why: string }) =>
      (x.due_label === 'overdue' ? 0 : 1) * 10 - x.why.length;
    return score(a) - score(b);
  });

  // My day: tasks due today + important dates today (next 24h)
  const dayEnd = new Date(now.getTime() + 86400000);
  const my_day = [];
  for (const c of clients) {
    if (c.tasks[0]?.dueDate) {
      const d = new Date(c.tasks[0].dueDate);
      if (d >= now && d <= dayEnd) {
        my_day.push({ type: 'task', client_id: c.id, client_name: c.name, label: c.tasks[0].title, when: 'today' });
      }
    }
    if (c.importantDateRecords[0]) {
      const d = new Date(c.importantDateRecords[0].scheduledAt);
      if (d >= now && d <= dayEnd) {
        my_day.push({ type: 'date', client_id: c.id, client_name: c.name, label: c.importantDateRecords[0].label, when: 'today' });
      }
    }
  }

  return NextResponse.json({
    needs_you: needs_you.slice(0, 50),
    my_day,
    counts: {
      needs_you: needs_you.length,
      unassigned: clients.filter((c) => c.clientAssignments.length === 0).length,
      reviews_due: needs_you.filter((n) => n.verb === 'Prepare').length,
    },
  });
}
