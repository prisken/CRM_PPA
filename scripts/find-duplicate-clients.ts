/**
 * Report potential duplicate Client records by normalized email or phone.
 * Read-only — does not modify the database.
 *
 * Run: npm run find:duplicate-clients
 */
import { normalizeEmail, normalizePhone } from '../lib/leadNormalization';
import { prisma } from '../lib/prisma';

type ClientRow = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  leadSource: string | null;
  status: string;
  createdAt: Date;
  lastModified: Date;
};

type DuplicateGroup = {
  key: string;
  clients: ClientRow[];
};

function groupByNormalizedValue(
  clients: ClientRow[],
  field: 'email' | 'phone'
) {
  const groups = new Map<string, ClientRow[]>();

  for (const client of clients) {
    const rawValue = field === 'email' ? client.email : client.phone;
    const normalized =
      field === 'email' ? normalizeEmail(rawValue) : normalizePhone(rawValue);

    if (!normalized) {
      continue;
    }

    const existing = groups.get(normalized) ?? [];
    existing.push(client);
    groups.set(normalized, existing);
  }

  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      clients: rows.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      ),
    }))
    .sort((a, b) => b.clients.length - a.clients.length || a.key.localeCompare(b.key));
}

function formatDate(value: Date) {
  return value.toISOString();
}

function printGroup(groupLabel: string, group: DuplicateGroup) {
  console.log(`\n${groupLabel}: ${group.key} (${group.clients.length} clients)`);
  console.log('-'.repeat(72));

  for (const client of group.clients) {
    console.log(`  id:          ${client.id}`);
    console.log(`  name:        ${client.name}`);
    console.log(`  company:     ${client.company ?? '—'}`);
    console.log(`  status:      ${client.status}`);
    console.log(`  lead_source: ${client.leadSource ?? '—'}`);
    console.log(`  email:       ${client.email ?? '—'}`);
    console.log(`  phone:       ${client.phone ?? '—'}`);
    console.log(`  createdAt:   ${formatDate(client.createdAt)}`);
    console.log(`  lastModified:${formatDate(client.lastModified)}`);
    console.log('');
  }
}

function printSection(title: string, groups: DuplicateGroup[]) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(title);
  console.log('='.repeat(72));

  if (groups.length === 0) {
    console.log('\nNo duplicate groups found.');
    return;
  }

  console.log(`\nFound ${groups.length} duplicate group(s).`);

  for (const group of groups) {
    printGroup(title.includes('email') ? 'Email' : 'Phone', group);
  }
}

async function main() {
  console.log('Scanning Client records for potential duplicates...\n');

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      phone: true,
      leadSource: true,
      status: true,
      createdAt: true,
      lastModified: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Loaded ${clients.length} client(s).`);

  const emailDuplicates = groupByNormalizedValue(clients, 'email');
  const phoneDuplicates = groupByNormalizedValue(clients, 'phone');

  printSection('Duplicate groups by normalized email', emailDuplicates);
  printSection('Duplicate groups by normalized phone', phoneDuplicates);

  const emailClientCount = emailDuplicates.reduce(
    (sum, group) => sum + group.clients.length,
    0
  );
  const phoneClientCount = phoneDuplicates.reduce(
    (sum, group) => sum + group.clients.length,
    0
  );

  console.log(`\n${'='.repeat(72)}`);
  console.log('Summary');
  console.log('='.repeat(72));
  console.log(`Email duplicate groups: ${emailDuplicates.length}`);
  console.log(`Clients in email duplicate groups: ${emailClientCount}`);
  console.log(`Phone duplicate groups: ${phoneDuplicates.length}`);
  console.log(`Clients in phone duplicate groups: ${phoneClientCount}`);
}

main()
  .catch((error) => {
    console.error('Failed to scan for duplicate clients.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
