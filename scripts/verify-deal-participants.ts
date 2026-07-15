/**
 * Verify DealParticipant setup for existing deals (read-only).
 *
 * Run: npm run verify:deal-participants
 */
import { DealParticipantRole, DealStatus } from '@prisma/client';
import {
  sumParticipantPercents,
  validateParticipantPercents,
} from '../lib/dealCommissionTemplates';
import { prisma } from '../lib/prisma';

const COMPANY_DEFAULT_EXTERNAL_NAME = 'Profit Pulse Ally';

type DealWithParticipants = {
  id: string;
  name: string;
  status: DealStatus;
  clientId: string;
  client: {
    name: string;
    company: string | null;
  };
  participants: {
    id: string;
    userId: string | null;
    externalName: string | null;
    role: DealParticipantRole;
    commissionPercent: { toString(): string };
    isCommissionable: boolean;
    returnablePercent: { toString(): string } | null;
    returnableAmount: { toString(): string } | null;
    isReturnableRequired: boolean;
  }[];
};

type DealIssueRow = {
  dealId: string;
  clientName: string;
  dealName: string;
  status: DealStatus;
  totalPercent: number | null;
  detail?: string;
};

function getClientDisplayName(client: DealWithParticipants['client']) {
  return client.company?.trim() || client.name;
}

function getTotalPercent(participants: DealWithParticipants['participants']) {
  if (participants.length === 0) {
    return null;
  }

  return sumParticipantPercents(participants);
}

function formatDealRow(row: DealIssueRow) {
  const percentLabel =
    row.totalPercent === null ? '—' : `${row.totalPercent}%`;
  const detailSuffix = row.detail ? ` | ${row.detail}` : '';

  return `- ${row.dealId} | ${row.clientName} | ${row.dealName} | ${row.status} | total ${percentLabel}${detailSuffix}`;
}

function printSection(title: string, rows: DealIssueRow[]) {
  console.log(`\n${title} (${rows.length})`);
  if (rows.length === 0) {
    console.log('  None');
    return;
  }

  for (const row of rows) {
    console.log(formatDealRow(row));
  }
}

function hasBlankIdentity(
  userId: string | null | undefined,
  externalName: string | null | undefined
) {
  return !userId?.trim() && !externalName?.trim();
}

function isValidCompanyParticipant(
  role: DealParticipantRole,
  userId: string | null,
  externalName: string | null
) {
  if (role !== DealParticipantRole.COMPANY) {
    return false;
  }

  if (userId?.trim()) {
    return true;
  }

  return externalName?.trim() === COMPANY_DEFAULT_EXTERNAL_NAME;
}

async function main() {
  console.log('Verifying deal participant setup...\n');

  const deals = await prisma.deal.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      clientId: true,
      client: {
        select: {
          name: true,
          company: true,
        },
      },
      participants: {
        select: {
          id: true,
          userId: true,
          externalName: true,
          role: true,
          commissionPercent: true,
          isCommissionable: true,
          returnablePercent: true,
          returnableAmount: true,
          isReturnableRequired: true,
        },
      },
    },
    orderBy: [{ client: { name: 'asc' } }, { createdAt: 'asc' }],
  });

  const noParticipants: DealIssueRow[] = [];
  const percentNot100: DealIssueRow[] = [];
  const noCompanyParticipant: DealIssueRow[] = [];
  const wonWithoutCommissionable: DealIssueRow[] = [];
  const missingIdentity: DealIssueRow[] = [];
  const doctorMissingIdentity: DealIssueRow[] = [];
  const doctorReturnableNotConfigured: DealIssueRow[] = [];
  const returnableRequiredMissingFields: DealIssueRow[] = [];
  const returnableRequiredWrongRole: DealIssueRow[] = [];
  const returnableRequiredMissingUser: DealIssueRow[] = [];
  const returnablePercentInvalid: DealIssueRow[] = [];
  const returnableAmountInvalid: DealIssueRow[] = [];

  for (const deal of deals) {
    const clientName = getClientDisplayName(deal.client);
    const totalPercent = getTotalPercent(deal.participants);
    const baseRow = {
      dealId: deal.id,
      clientName,
      dealName: deal.name,
      status: deal.status,
      totalPercent,
    };

    if (deal.participants.length === 0) {
      noParticipants.push(baseRow);
      continue;
    }

    const validation = validateParticipantPercents(deal.participants);
    if (!validation.ok) {
      percentNot100.push({
        ...baseRow,
        totalPercent: validation.total,
        detail: validation.message,
      });
    }

    const hasCompanyParticipant = deal.participants.some((participant) =>
      isValidCompanyParticipant(
        participant.role,
        participant.userId,
        participant.externalName
      )
    );
    if (!hasCompanyParticipant) {
      noCompanyParticipant.push(baseRow);
    }

    if (deal.status === DealStatus.WON) {
      const hasCommissionableParticipant = deal.participants.some(
        (participant) => participant.isCommissionable
      );
      if (!hasCommissionableParticipant) {
        wonWithoutCommissionable.push(baseRow);
      }

      const doctorParticipants = deal.participants.filter(
        (participant) => participant.role === DealParticipantRole.DOCTOR
      );
      const doctorsWithoutReturnable = doctorParticipants.filter(
        (participant) =>
          participant.userId &&
          participant.isCommissionable &&
          !participant.isReturnableRequired
      );

      if (doctorParticipants.length > 0 && doctorsWithoutReturnable.length > 0) {
        doctorReturnableNotConfigured.push({
          ...baseRow,
          detail: `${doctorsWithoutReturnable.length} doctor(s) without returnable required`,
        });
      }
    }

    for (const participant of deal.participants) {
      if (hasBlankIdentity(participant.userId, participant.externalName)) {
        if (participant.role === DealParticipantRole.COMPANY) {
          continue;
        }

        missingIdentity.push({
          ...baseRow,
          detail: `participant ${participant.id} (${participant.role})`,
        });
      }

      if (
        participant.role === DealParticipantRole.DOCTOR &&
        hasBlankIdentity(participant.userId, participant.externalName)
      ) {
        doctorMissingIdentity.push({
          ...baseRow,
          detail: `participant ${participant.id}`,
        });
      }

      const returnablePercent =
        participant.returnablePercent !== null
          ? Number(participant.returnablePercent)
          : null;
      const returnableAmount =
        participant.returnableAmount !== null
          ? Number(participant.returnableAmount)
          : null;

      if (
        returnablePercent !== null &&
        (!Number.isFinite(returnablePercent) ||
          returnablePercent < 0 ||
          returnablePercent > 100)
      ) {
        returnablePercentInvalid.push({
          ...baseRow,
          detail: `participant ${participant.id} (${returnablePercent})`,
        });
      }

      if (
        returnableAmount !== null &&
        (!Number.isFinite(returnableAmount) || returnableAmount < 0)
      ) {
        returnableAmountInvalid.push({
          ...baseRow,
          detail: `participant ${participant.id} (${returnableAmount})`,
        });
      }

      if (!participant.isReturnableRequired) {
        continue;
      }

      if (participant.role !== DealParticipantRole.DOCTOR) {
        returnableRequiredWrongRole.push({
          ...baseRow,
          detail: `participant ${participant.id} (${participant.role})`,
        });
      }

      if (!participant.userId) {
        returnableRequiredMissingUser.push({
          ...baseRow,
          detail: `participant ${participant.id}`,
        });
      }

      if (returnableAmount === null && returnablePercent === null) {
        returnableRequiredMissingFields.push({
          ...baseRow,
          detail: `participant ${participant.id}`,
        });
      }
    }
  }

  printSection('1. Deals with no participants', noParticipants);
  printSection('2. Deals where participant percent total is not 100', percentNot100);
  printSection('3. Deals with no COMPANY participant', noCompanyParticipant);
  printSection(
    '4. WON deals with no commissionable participants',
    wonWithoutCommissionable
  );
  printSection(
    '5. Participants with neither userId nor externalName (COMPANY may use Profit Pulse Ally)',
    missingIdentity
  );
  printSection(
    '6. Doctor participants with no userId and no externalName',
    doctorMissingIdentity
  );
  printSection(
    '7. [Info] WON deals with doctor participants but no returnable required',
    doctorReturnableNotConfigured
  );
  printSection(
    '8. Participants with returnable required but no amount/percent',
    returnableRequiredMissingFields
  );
  printSection(
    '9. Participants with returnable required but role is not DOCTOR',
    returnableRequiredWrongRole
  );
  printSection(
    '10. Participants with returnable required but no userId',
    returnableRequiredMissingUser
  );
  printSection('11. Participants with invalid returnablePercent', returnablePercentInvalid);
  printSection('12. Participants with invalid returnableAmount', returnableAmountInvalid);

  const issueCount =
    noParticipants.length +
    percentNot100.length +
    noCompanyParticipant.length +
    wonWithoutCommissionable.length +
    missingIdentity.length +
    doctorMissingIdentity.length +
    returnableRequiredMissingFields.length +
    returnableRequiredWrongRole.length +
    returnableRequiredMissingUser.length +
    returnablePercentInvalid.length +
    returnableAmountInvalid.length;

  console.log('\nSummary:');
  console.log(`- Deals checked: ${deals.length}`);
  console.log(`- Error rows reported: ${issueCount}`);
  console.log(
    `- Informational rows (doctor returnables not configured): ${doctorReturnableNotConfigured.length}`
  );

  await prisma.$disconnect();

  if (issueCount > 0) {
    process.exit(1);
  }

  console.log('\nAll checks passed.');
}

main().catch(async (error) => {
  console.error('Deal participant verification failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
