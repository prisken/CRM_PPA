/**
 * Multi-email / multi-phone contact helpers + replace/sync smoke tests.
 *
 * Run: npx tsx scripts/test-client-contacts.ts
 */
import { ClientContactKind } from '@prisma/client';
import assert from 'node:assert/strict';
import {
  parseClientContactInput,
  replaceClientContacts,
  resolveContactsFromRecords,
} from '../lib/clientContacts';
import { prisma } from '../lib/prisma';

function pass(label: string) {
  console.log(`[PASS] ${label}`);
}

async function main() {
  let passed = 0;
  let failed = 0;

  function check(label: string, fn: () => void) {
    try {
      fn();
      pass(label);
      passed += 1;
    } catch (error) {
      console.error(`[FAIL] ${label}`, error);
      failed += 1;
    }
  }

  check('parse emails array + scalar phone', () => {
    const parsed = parseClientContactInput({
      emails: ['a@example.com', ' B@Example.com ', 'a@example.com'],
      phone: '+852 1111 2222',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.data.emails, ['a@example.com', 'B@Example.com']);
    assert.equal(parsed.data.phones.length, 1);
    assert.equal(parsed.data.email, 'a@example.com');
    assert.equal(parsed.data.emailsProvided, true);
    assert.equal(parsed.data.phonesProvided, true);
  });

  check('parse empty emails clears', () => {
    const parsed = parseClientContactInput({ emails: [] });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.data.emails, []);
    assert.equal(parsed.data.email, null);
    assert.equal(parsed.data.emailsProvided, true);
    assert.equal(parsed.data.phonesProvided, false);
  });

  check('reject invalid email', () => {
    const parsed = parseClientContactInput({ emails: ['not-an-email'] });
    assert.equal(parsed.ok, false);
  });

  check('resolveContactsFromRecords prefers primary then sort', () => {
    const resolved = resolveContactsFromRecords([
      {
        kind: ClientContactKind.EMAIL,
        value: 'second@x.com',
        isPrimary: false,
        sortOrder: 1,
      },
      {
        kind: ClientContactKind.EMAIL,
        value: 'first@x.com',
        isPrimary: true,
        sortOrder: 0,
      },
      {
        kind: ClientContactKind.PHONE,
        value: '999',
        isPrimary: true,
        sortOrder: 0,
      },
    ]);
    assert.deepEqual(resolved.emails, ['first@x.com', 'second@x.com']);
    assert.equal(resolved.phone, '999');
  });

  const suffix = Date.now();
  const client = await prisma.client.create({
    data: {
      name: `CONTACT TEST ${suffix}`,
      email: `primary-${suffix}@example.com`,
      phone: `+8529000${String(suffix).slice(-4)}`,
    },
  });

  try {
    const synced = await prisma.$transaction((tx) =>
      replaceClientContacts(tx, client.id, {
        emails: [
          `primary-${suffix}@example.com`,
          `alt-${suffix}@example.com`,
        ],
        phones: [`+8529000${String(suffix).slice(-4)}`, '+85291112222'],
      })
    );

    check('replaceClientContacts sets primary mirrors', () => {
      assert.equal(synced.emails.length, 2);
      assert.equal(synced.phones.length, 2);
      assert.equal(synced.email, `primary-${suffix}@example.com`);
    });

    const refreshed = await prisma.client.findUniqueOrThrow({
      where: { id: client.id },
      include: { contacts: true },
    });

    check('DB mirrors + contact rows persist', () => {
      assert.equal(refreshed.email, `primary-${suffix}@example.com`);
      assert.equal(refreshed.contacts.length, 4);
      assert.equal(
        refreshed.contacts.filter((c) => c.kind === 'EMAIL').length,
        2
      );
    });
  } finally {
    await prisma.clientContact.deleteMany({ where: { clientId: client.id } });
    await prisma.client.delete({ where: { id: client.id } });
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log('PASS');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
