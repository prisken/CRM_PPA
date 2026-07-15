import { ClientContactKind, type Prisma, type PrismaClient } from '@prisma/client';
import { normalizeEmail, normalizePhone } from '@/lib/leadNormalization';

export type ClientContactRecordLike = {
  id?: string;
  kind: ClientContactKind | 'EMAIL' | 'PHONE';
  value: string;
  normalizedValue?: string;
  label?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
};

export const clientContactSelect = {
  id: true,
  kind: true,
  value: true,
  normalizedValue: true,
  label: true,
  isPrimary: true,
  sortOrder: true,
} satisfies Prisma.ClientContactSelect;

export type ParsedContactRow = {
  kind: ClientContactKind;
  value: string;
  normalizedValue: string;
  label: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type ParsedClientContacts = {
  emailsProvided: boolean;
  phonesProvided: boolean;
  emails: string[];
  phones: string[];
  email: string | null;
  phone: string | null;
  rows: ParsedContactRow[];
};

const MAX_CONTACTS_PER_KIND = 10;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => (typeof entry === 'string' ? entry : String(entry ?? '')));
}

function uniqueNormalizedRows(
  kind: ClientContactKind,
  values: string[]
): ParsedContactRow[] {
  const seen = new Set<string>();
  const rows: ParsedContactRow[] = [];

  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    const normalized =
      kind === ClientContactKind.EMAIL
        ? normalizeEmail(trimmed)
        : normalizePhone(trimmed);

    if (!normalized) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    rows.push({
      kind,
      value: trimmed,
      normalizedValue: normalized,
      label: null,
      isPrimary: rows.length === 0,
      sortOrder: rows.length,
    });
  }

  return rows;
}

/**
 * Resolve contact lists from either new `emails`/`phones` arrays or legacy
 * scalar `email`/`phone`. Arrays win when provided (including empty = clear).
 */
export function parseClientContactInput(body: {
  email?: unknown;
  phone?: unknown;
  emails?: unknown;
  phones?: unknown;
}): { ok: true; data: ParsedClientContacts } | { ok: false; error: string } {
  const emailsArrayProvided = Object.prototype.hasOwnProperty.call(body, 'emails');
  const phonesArrayProvided = Object.prototype.hasOwnProperty.call(body, 'phones');
  const emailScalarProvided = Object.prototype.hasOwnProperty.call(body, 'email');
  const phoneScalarProvided = Object.prototype.hasOwnProperty.call(body, 'phone');

  if (emailsArrayProvided && !Array.isArray(body.emails)) {
    return { ok: false, error: 'emails must be an array of strings' };
  }
  if (phonesArrayProvided && !Array.isArray(body.phones)) {
    return { ok: false, error: 'phones must be an array of strings' };
  }

  const emailsProvided = emailsArrayProvided || emailScalarProvided;
  const phonesProvided = phonesArrayProvided || phoneScalarProvided;

  const emailValues = emailsArrayProvided
    ? asStringArray(body.emails)
    : emailScalarProvided
      ? typeof body.email === 'string'
        ? [body.email]
        : body.email == null
          ? []
          : [String(body.email)]
      : null;

  const phoneValues = phonesArrayProvided
    ? asStringArray(body.phones)
    : phoneScalarProvided
      ? typeof body.phone === 'string'
        ? [body.phone]
        : body.phone == null
          ? []
          : [String(body.phone)]
      : null;

  if (emailValues && emailValues.filter((v) => v.trim()).length > MAX_CONTACTS_PER_KIND) {
    return {
      ok: false,
      error: `At most ${MAX_CONTACTS_PER_KIND} email addresses allowed`,
    };
  }
  if (phoneValues && phoneValues.filter((v) => v.trim()).length > MAX_CONTACTS_PER_KIND) {
    return {
      ok: false,
      error: `At most ${MAX_CONTACTS_PER_KIND} phone numbers allowed`,
    };
  }

  if (emailValues) {
    for (const raw of emailValues) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (!normalizeEmail(trimmed) || !trimmed.includes('@')) {
        return { ok: false, error: `Invalid email address: ${trimmed}` };
      }
    }
  }
  if (phoneValues) {
    for (const raw of phoneValues) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (!normalizePhone(trimmed)) {
        return { ok: false, error: `Invalid phone number: ${trimmed}` };
      }
    }
  }

  const emailRows = emailValues
    ? uniqueNormalizedRows(ClientContactKind.EMAIL, emailValues)
    : [];
  const phoneRows = phoneValues
    ? uniqueNormalizedRows(ClientContactKind.PHONE, phoneValues)
    : [];

  const emails = emailRows.map((row) => row.value);
  const phones = phoneRows.map((row) => row.value);

  return {
    ok: true,
    data: {
      emailsProvided,
      phonesProvided,
      emails,
      phones,
      email: emails[0] ?? null,
      phone: phones[0] ?? null,
      rows: [...emailRows, ...phoneRows],
    },
  };
}

export function resolveContactsFromRecords(
  records: ClientContactRecordLike[] | null | undefined,
  fallbackEmail?: string | null,
  fallbackPhone?: string | null
): { emails: string[]; phones: string[]; email: string | null; phone: string | null } {
  const sorted = [...(records ?? [])].sort((a, b) => {
    const primaryDelta = Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
    if (primaryDelta !== 0) return primaryDelta;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const emails = sorted
    .filter((row) => String(row.kind) === 'EMAIL')
    .map((row) => row.value.trim())
    .filter(Boolean);
  const phones = sorted
    .filter((row) => String(row.kind) === 'PHONE')
    .map((row) => row.value.trim())
    .filter(Boolean);

  if (emails.length === 0 && fallbackEmail?.trim()) {
    emails.push(fallbackEmail.trim());
  }
  if (phones.length === 0 && fallbackPhone?.trim()) {
    phones.push(fallbackPhone.trim());
  }

  return {
    emails,
    phones,
    email: emails[0] ?? null,
    phone: phones[0] ?? null,
  };
}

/**
 * Replace EMAIL and/or PHONE rows for a client and sync primary mirrors.
 * Omit a kind (pass undefined) to leave existing rows of that kind unchanged.
 */
export async function replaceClientContacts(
  tx: Prisma.TransactionClient,
  clientId: string,
  input: {
    emails?: string[] | null;
    phones?: string[] | null;
  }
): Promise<{ email: string | null; phone: string | null; emails: string[]; phones: string[] }> {
  if (input.emails !== undefined && input.emails !== null) {
    const emailRows = uniqueNormalizedRows(ClientContactKind.EMAIL, input.emails);
    await tx.clientContact.deleteMany({
      where: { clientId, kind: ClientContactKind.EMAIL },
    });
    if (emailRows.length > 0) {
      await tx.clientContact.createMany({
        data: emailRows.map((row) => ({
          clientId,
          kind: row.kind,
          value: row.value,
          normalizedValue: row.normalizedValue,
          label: row.label,
          isPrimary: row.isPrimary,
          sortOrder: row.sortOrder,
        })),
      });
    }
  }

  if (input.phones !== undefined && input.phones !== null) {
    const phoneRows = uniqueNormalizedRows(ClientContactKind.PHONE, input.phones);
    await tx.clientContact.deleteMany({
      where: { clientId, kind: ClientContactKind.PHONE },
    });
    if (phoneRows.length > 0) {
      await tx.clientContact.createMany({
        data: phoneRows.map((row) => ({
          clientId,
          kind: row.kind,
          value: row.value,
          normalizedValue: row.normalizedValue,
          label: row.label,
          isPrimary: row.isPrimary,
          sortOrder: row.sortOrder,
        })),
      });
    }
  }

  const remaining = await tx.clientContact.findMany({
    where: { clientId },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    select: clientContactSelect,
  });

  const resolved = resolveContactsFromRecords(remaining);
  await tx.client.update({
    where: { id: clientId },
    data: {
      email: resolved.email,
      phone: resolved.phone,
    },
  });

  return resolved;
}

/** Ensure primary scalar mirrors exist as contact rows (used on create). */
export async function syncPrimaryContactsFromScalars(
  tx: Prisma.TransactionClient,
  clientId: string,
  email: string | null,
  phone: string | null
) {
  return replaceClientContacts(tx, clientId, {
    emails: email ? [email] : [],
    phones: phone ? [phone] : [],
  });
}

/**
 * Add a contact value if not already present for this client.
 * Does not remove existing contacts. Syncs primary mirrors if this becomes first of kind.
 */
export async function ensureClientContact(
  tx: Prisma.TransactionClient,
  clientId: string,
  kind: ClientContactKind,
  rawValue: string | null | undefined
): Promise<boolean> {
  if (!rawValue?.trim()) {
    return false;
  }

  const normalized =
    kind === ClientContactKind.EMAIL
      ? normalizeEmail(rawValue)
      : normalizePhone(rawValue);

  if (!normalized) {
    return false;
  }

  const existing = await tx.clientContact.findUnique({
    where: {
      clientId_kind_normalizedValue: {
        clientId,
        kind,
        normalizedValue: normalized,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return false;
  }

  const count = await tx.clientContact.count({
    where: { clientId, kind },
  });

  await tx.clientContact.create({
    data: {
      clientId,
      kind,
      value: rawValue.trim(),
      normalizedValue: normalized,
      isPrimary: count === 0,
      sortOrder: count,
    },
  });

  if (count === 0) {
    await tx.client.update({
      where: { id: clientId },
      data:
        kind === ClientContactKind.EMAIL
          ? { email: rawValue.trim() }
          : { phone: rawValue.trim() },
    });
  }

  return true;
}

/**
 * Union contacts from canonical + duplicate onto canonical, preferring primary
 * mirrors (email/phone) as the first entries. Clears duplicate contact rows.
 */
export async function mergeContactsOntoCanonical(
  tx: Prisma.TransactionClient,
  canonicalClientId: string,
  duplicateClientId: string,
  primaryEmail: string | null,
  primaryPhone: string | null
) {
  const [canonical, duplicate, canonicalClient, duplicateClient] =
    await Promise.all([
      tx.clientContact.findMany({
        where: { clientId: canonicalClientId },
        select: clientContactSelect,
      }),
      tx.clientContact.findMany({
        where: { clientId: duplicateClientId },
        select: clientContactSelect,
      }),
      tx.client.findUnique({
        where: { id: canonicalClientId },
        select: { email: true, phone: true },
      }),
      tx.client.findUnique({
        where: { id: duplicateClientId },
        select: { email: true, phone: true },
      }),
    ]);

  const emailCandidates = [
    primaryEmail,
    ...canonical
      .filter((row) => row.kind === ClientContactKind.EMAIL)
      .map((row) => row.value),
    canonicalClient?.email,
    ...duplicate
      .filter((row) => row.kind === ClientContactKind.EMAIL)
      .map((row) => row.value),
    duplicateClient?.email,
  ].filter((value): value is string => Boolean(value?.trim()));

  const phoneCandidates = [
    primaryPhone,
    ...canonical
      .filter((row) => row.kind === ClientContactKind.PHONE)
      .map((row) => row.value),
    canonicalClient?.phone,
    ...duplicate
      .filter((row) => row.kind === ClientContactKind.PHONE)
      .map((row) => row.value),
    duplicateClient?.phone,
  ].filter((value): value is string => Boolean(value?.trim()));

  await replaceClientContacts(tx, canonicalClientId, {
    emails: emailCandidates,
    phones: phoneCandidates,
  });

  await tx.clientContact.deleteMany({
    where: { clientId: duplicateClientId },
  });
}

export function buildContactSearchOr(search: string): Prisma.ClientWhereInput[] {
  const phoneNormalized = normalizePhone(search);
  const clauses: Prisma.ClientWhereInput[] = [
    { email: { contains: search, mode: 'insensitive' } },
    { phone: { contains: search, mode: 'insensitive' } },
    {
      contacts: {
        some: {
          value: { contains: search, mode: 'insensitive' },
        },
      },
    },
  ];

  if (phoneNormalized) {
    clauses.push({
      contacts: {
        some: {
          kind: ClientContactKind.PHONE,
          normalizedValue: { contains: phoneNormalized },
        },
      },
    });
  }

  return clauses;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function findClientIdsByNormalizedContact(
  db: DbClient,
  kind: ClientContactKind,
  normalizedValue: string
): Promise<string[]> {
  const rows = await db.clientContact.findMany({
    where: { kind, normalizedValue },
    select: { clientId: true },
  });
  return [...new Set(rows.map((row) => row.clientId))];
}
