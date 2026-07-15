/**
 * Read-only audit of deals missing DealParticipant rows (legacy commission fallback).
 *
 * Does not mutate data. For writes, use:
 *   npm run backfill:deal-participants:dry
 *   npm run backfill:deal-participants
 *
 * Run: npm run audit:legacy-commission
 */
import { AssignmentRole, DealStatus } from '@prisma/client';
import { DEAL_TYPE_LABELS } from '../lib/dealCommissionTemplates';
import { prisma } from '../lib/prisma';

type AssignmentSummary = {
  role: AssignmentRole;
  count: number;
};

function formatMoney(value: { toString(): string } | number) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatAssignmentSummary(assignments: AssignmentSummary[]) {
  if (assignments.length === 0) {
    return 'none';
  }

  return assignments
    .map((entry) => `${entry.role}×${entry.count}`)
    .join(', ');
}

function getClientDisplayName(client: {
  name: string;
  company: string | null;
}) {
  return client.company?.trim() || client.name;
}

async function main() {
  console.log('Auditing legacy commission fallback (deals with no participants)...\n');

  const [totalDeals, dealsMissingParticipants] = await Promise.all([
    prisma.deal.count(),
    prisma.deal.findMany({
      where: {
        participants: {
          none: {},
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        dealType: true,
        totalCommission: true,
        clientId: true,
        client: {
          select: {
            name: true,
            company: true,
            clientAssignments: {
              select: {
                role: true,
              },
            },
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { client: { name: 'asc' } },
        { createdAt: 'asc' },
      ],
    }),
  ]);

  const wonMissing = dealsMissingParticipants.filter(
    (deal) => deal.status === DealStatus.WON
  );
  const proposedMissing = dealsMissingParticipants.filter(
    (deal) => deal.status === DealStatus.PROPOSED
  );
  const otherMissing = dealsMissingParticipants.filter(
    (deal) =>
      deal.status !== DealStatus.WON && deal.status !== DealStatus.PROPOSED
  );

  console.log('Summary');
  console.log(`- Total deals: ${totalDeals}`);
  console.log(
    `- Deals missing participants (LEGACY_FALLBACK): ${dealsMissingParticipants.length}`
  );
  console.log(`- WON missing participants: ${wonMissing.length}`);
  console.log(`- PROPOSED missing participants: ${proposedMissing.length}`);
  console.log(`- Other statuses missing participants: ${otherMissing.length}`);
  console.log(
    `- Deals with participants (PARTICIPANT model): ${
      totalDeals - dealsMissingParticipants.length
    }`
  );

  function printSection(
    title: string,
    deals: typeof dealsMissingParticipants
  ) {
    console.log(`\n${title} (${deals.length})`);
    if (deals.length === 0) {
      console.log('  None');
      return;
    }

    for (const deal of deals) {
      const roleCounts = new Map<AssignmentRole, number>();
      for (const assignment of deal.client.clientAssignments) {
        roleCounts.set(
          assignment.role,
          (roleCounts.get(assignment.role) ?? 0) + 1
        );
      }

      const assignmentSummary = formatAssignmentSummary(
        [...roleCounts.entries()].map(([role, count]) => ({ role, count }))
      );

      console.log(
        [
          `- ${deal.id}`,
          getClientDisplayName(deal.client),
          deal.name,
          deal.status,
          DEAL_TYPE_LABELS[deal.dealType],
          `commission $${formatMoney(deal.totalCommission)}`,
          `assignments: ${assignmentSummary}`,
        ].join(' | ')
      );
    }
  }

  printSection('WON deals missing participants', wonMissing);
  printSection('PROPOSED deals missing participants', proposedMissing);
  printSection('Other deals missing participants', otherMissing);

  console.log('\nNext steps (optional):');
  console.log('  npm run backfill:deal-participants:dry');
  console.log('  npm run backfill:deal-participants');
  console.log('  npm run verify:deal-participants');

  await prisma.$disconnect();

  // Non-zero exit when WON deals still lack participants (high risk).
  if (wonMissing.length > 0) {
    console.log(
      `\nAudit found ${wonMissing.length} WON deal(s) on legacy fallback.`
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nNo WON deals on legacy commission fallback.');
}

main().catch(async (error) => {
  console.error('Legacy commission audit failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
