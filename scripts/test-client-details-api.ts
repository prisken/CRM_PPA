/**
 * PUT /api/clients/[id]/details — contacts + important dates replace.
 *
 * Run: npm run test:client-details-api
 */
import { UserRole, UserStatus } from '@prisma/client';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { PUT as putClientDetails } from '../src/app/api/clients/[id]/details/route';

const RUN_ID = Date.now();

async function main() {
  const admin = await prisma.user.create({
    data: {
      email: `details-api-admin-${RUN_ID}@example.test`,
      name: 'Details API Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true, role: true, name: true },
  });

  const client = await prisma.client.create({
    data: {
      name: `Details API Client ${RUN_ID}`,
      email: `details-client-${RUN_ID}@example.test`,
      company: 'ecovadis',
      roleInCompany: 'Ratings Provider',
      employeeCount: 100,
    },
    select: { id: true, name: true },
  });

  const token = await signAuthToken({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    name: admin.name,
  });

  const body = {
    name: client.name,
    company: 'ecovadis',
    emails: [`samuel.kwok-${RUN_ID}@ecovadis.com`],
    phones: ['+85212345678'],
    lead_source: 'Referral',
    roleInCompany: 'Ratings Provider',
    employeeCount: 2500,
    expectations: null,
    importantDates: [
      {
        label: 'Fact finding one on one',
        date: '2028-07-17',
        time: '17:00',
        notes: null,
      },
      {
        label: 'Presenting strategies',
        date: '2028-07-30',
        time: '20:00',
        notes: null,
      },
    ],
  };

  const res = await putClientDetails(
    new Request(`http://localhost/api/clients/${client.id}/details`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: client.id }) }
  );

  const json = await res.json();
  if (res.status !== 200) {
    console.error('PUT failed', res.status, json);
    process.exitCode = 1;
    return;
  }

  const dates = await prisma.clientImportantDate.findMany({
    where: { clientId: client.id },
    orderBy: { scheduledAt: 'asc' },
    select: { label: true, hasTime: true },
  });

  if (dates.length !== 2) {
    console.error('expected 2 important dates, got', dates.length);
    process.exitCode = 1;
    return;
  }

  const contacts = await prisma.clientContact.count({
    where: { clientId: client.id },
  });
  if (contacts < 2) {
    console.error('expected at least 2 contacts, got', contacts);
    process.exitCode = 1;
    return;
  }

  console.log('PASS client details PUT with contacts + important dates');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.clientImportantDate.deleteMany({
      where: { client: { email: { contains: String(RUN_ID) } } },
    });
    await prisma.clientContact.deleteMany({
      where: { client: { email: { contains: String(RUN_ID) } } },
    });
    await prisma.clientActivityLog.deleteMany({
      where: { client: { email: { contains: String(RUN_ID) } } },
    });
    await prisma.client.deleteMany({
      where: { email: { contains: String(RUN_ID) } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: String(RUN_ID) } },
    });
    await prisma.$disconnect();
  });
