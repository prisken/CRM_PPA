/**
 * POST /api/admin/leads/bulk-delete — archive + validation.
 *
 * Run: npm run test:bulk-delete-leads
 */
import { ClientStatus, UserRole, UserStatus } from '@prisma/client';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { POST as bulkDeleteLeads } from '../src/app/api/admin/leads/bulk-delete/route';

const RUN_ID = Date.now();

async function requestBulkDelete(
  token: string,
  body: Record<string, unknown>
) {
  return bulkDeleteLeads(
    new Request('http://localhost/api/admin/leads/bulk-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  );
}

async function main() {
  const admin = await prisma.user.create({
    data: {
      email: `bulk-delete-admin-${RUN_ID}@example.test`,
      name: 'Bulk Delete Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true, role: true, name: true },
  });

  const clients = await Promise.all(
    [1, 2].map((index) =>
      prisma.client.create({
        data: {
          name: `Bulk Delete Lead ${RUN_ID}-${index}`,
          email: `bulk-delete-${RUN_ID}-${index}@example.test`,
          status: ClientStatus.NEW_LEAD,
        },
        select: { id: true, status: true },
      })
    )
  );

  const token = await signAuthToken({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    name: admin.name,
  });

  const missingIdsRes = await requestBulkDelete(token, {
    clientIds: [clients[0].id, 'missing-client-id'],
    mode: 'archive',
  });
  if (missingIdsRes.status !== 400) {
    console.error('expected 400 for missing client ids, got', missingIdsRes.status);
    process.exitCode = 1;
    return;
  }

  const archiveRes = await requestBulkDelete(token, {
    clientIds: clients.map((client) => client.id),
    mode: 'archive',
  });
  const archiveJson = await archiveRes.json();
  if (archiveRes.status !== 200 || archiveJson.count !== 2) {
    console.error('archive failed', archiveRes.status, archiveJson);
    process.exitCode = 1;
    return;
  }

  const archived = await prisma.client.findMany({
    where: { id: { in: clients.map((client) => client.id) } },
    select: { status: true },
  });
  if (!archived.every((client) => client.status === ClientStatus.ARCHIVED)) {
    console.error('expected all clients archived', archived);
    process.exitCode = 1;
    return;
  }

  const permanentWithoutPassword = await requestBulkDelete(token, {
    clientIds: [clients[0].id],
    mode: 'permanent',
    confirmPhrase: 'DELETE',
  });
  if (permanentWithoutPassword.status !== 403) {
    console.error(
      'expected 403 for permanent delete without password, got',
      permanentWithoutPassword.status
    );
    process.exitCode = 1;
    return;
  }

  console.log('PASS bulk delete leads archive + permanent validation');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
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
