import {
  ActivityLogType,
  ClientStatus,
  LeadSourceType,
  Prisma,
  type Client,
} from '@prisma/client';
import {
  compactString,
  normalizeCompany,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '@/lib/leadNormalization';
import { prisma } from '@/lib/prisma';

export type IngestExternalLeadInput = {
  source: LeadSourceType;
  externalId?: string | null;
  payload: unknown;
  lead: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    leadSource?: string | null;
    roleInCompany?: string | null;
    employeeCount?: number | null;
    expectations?: string | null;
    contactInfo?: string | null;
  };
  defaultLeadSource: string;
};

export type IngestExternalLeadResult = {
  ok: true;
  action: 'created' | 'updated';
  clientId: string;
  matchedBy: 'source_external_id' | 'email' | 'phone' | 'none';
};

type NormalizedLeadFields = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  leadSource: string | null;
  roleInCompany: string | null;
  employeeCount: number | null;
  expectations: string | null;
  contactInfo: string | null;
};

const CLIENT_MERGE_SELECT = {
  id: true,
  name: true,
  company: true,
  contactInfo: true,
  email: true,
  phone: true,
  leadSource: true,
  roleInCompany: true,
  employeeCount: true,
  expectations: true,
  status: true,
} as const;

type ClientMergeSnapshot = Pick<
  Client,
  | 'id'
  | 'name'
  | 'company'
  | 'contactInfo'
  | 'email'
  | 'phone'
  | 'leadSource'
  | 'roleInCompany'
  | 'employeeCount'
  | 'expectations'
  | 'status'
>;

function toJsonPayload(payload: unknown): Prisma.InputJsonValue {
  if (payload === undefined) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
  } catch {
    return { value: String(payload) };
  }
}

function normalizeLeadFields(
  input: IngestExternalLeadInput
): NormalizedLeadFields {
  return {
    name: normalizeName(input.lead.name),
    email: normalizeEmail(input.lead.email),
    phone: normalizePhone(input.lead.phone),
    company: normalizeCompany(input.lead.company),
    leadSource:
      compactString(input.lead.leadSource) ?? compactString(input.defaultLeadSource),
    roleInCompany: compactString(input.lead.roleInCompany),
    employeeCount:
      typeof input.lead.employeeCount === 'number' &&
      Number.isInteger(input.lead.employeeCount) &&
      input.lead.employeeCount >= 0
        ? input.lead.employeeCount
        : null,
    expectations: compactString(input.lead.expectations),
    contactInfo: compactString(input.lead.contactInfo),
  };
}

function isBlank(value: string | null | undefined) {
  return value === null || value === undefined || value.trim() === '';
}

function emailsEquivalent(
  existing: string | null | undefined,
  incoming: string | null
) {
  if (!incoming) {
    return false;
  }

  const normalizedExisting = normalizeEmail(existing);
  return normalizedExisting !== null && normalizedExisting === incoming;
}

function mergeScalarField(
  existing: string | null | undefined,
  incoming: string | null,
  options?: { allowCaseNormalization?: boolean }
) {
  if (!incoming) {
    return undefined;
  }

  if (isBlank(existing)) {
    return incoming;
  }

  const current = existing as string;

  if (
    options?.allowCaseNormalization &&
    emailsEquivalent(current, incoming)
  ) {
    return incoming;
  }

  if (current !== incoming) {
    return undefined;
  }

  return undefined;
}

function buildContactInfoAppend(
  existing: string | null | undefined,
  incoming: string | null
) {
  if (!incoming) {
    return undefined;
  }

  const current = existing?.trim() ?? '';

  if (!current) {
    return incoming;
  }

  if (current.includes(incoming)) {
    return undefined;
  }

  return `${current}\n\n${incoming}`;
}

function mergeClientUpdateData(
  existing: ClientMergeSnapshot,
  incoming: NormalizedLeadFields
): Prisma.ClientUpdateInput {
  const update: Prisma.ClientUpdateInput = {};

  const name = mergeScalarField(existing.name, incoming.name);
  if (name !== undefined) {
    update.name = name;
  }

  const company = mergeScalarField(existing.company, incoming.company);
  if (company !== undefined) {
    update.company = company;
  }

  const email = mergeScalarField(existing.email, incoming.email, {
    allowCaseNormalization: true,
  });
  if (email !== undefined) {
    update.email = email;
  }

  const phone = mergeScalarField(existing.phone, incoming.phone);
  if (phone !== undefined) {
    update.phone = phone;
  }

  if (isBlank(existing.leadSource) && incoming.leadSource) {
    update.leadSource = incoming.leadSource;
  }

  const roleInCompany = mergeScalarField(
    existing.roleInCompany,
    incoming.roleInCompany
  );
  if (roleInCompany !== undefined) {
    update.roleInCompany = roleInCompany;
  }

  if (existing.employeeCount === null && incoming.employeeCount !== null) {
    update.employeeCount = incoming.employeeCount;
  }

  const expectations = mergeScalarField(
    existing.expectations,
    incoming.expectations
  );
  if (expectations !== undefined) {
    update.expectations = expectations;
  }

  const contactInfo = buildContactInfoAppend(
    existing.contactInfo,
    incoming.contactInfo
  );
  if (contactInfo !== undefined) {
    update.contactInfo = contactInfo;
  }

  return update;
}

function buildCreateData(
  incoming: NormalizedLeadFields,
  defaultLeadSource: string
): Prisma.ClientCreateInput {
  return {
    name: incoming.name ?? incoming.email ?? 'Unknown Lead',
    company: incoming.company,
    email: incoming.email,
    phone: incoming.phone,
    leadSource: incoming.leadSource ?? defaultLeadSource,
    roleInCompany: incoming.roleInCompany,
    employeeCount: incoming.employeeCount,
    expectations: incoming.expectations,
    contactInfo: incoming.contactInfo,
    status: ClientStatus.NEW_LEAD,
  };
}

async function findClientBySourceExternalId(
  source: LeadSourceType,
  externalId: string
) {
  const sourceRecord = await prisma.clientSourceRecord.findUnique({
    where: {
      source_externalId: {
        source,
        externalId,
      },
    },
    select: {
      clientId: true,
      client: {
        select: CLIENT_MERGE_SELECT,
      },
    },
  });

  if (!sourceRecord) {
    return null;
  }

  return {
    client: sourceRecord.client,
    matchedBy: 'source_external_id' as const,
    skipSourceRecordCreate: true,
  };
}

async function findClientByEmail(normalizedEmail: string) {
  const client = await prisma.client.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
    },
    select: CLIENT_MERGE_SELECT,
  });

  if (!client) {
    return null;
  }

  return {
    client,
    matchedBy: 'email' as const,
    skipSourceRecordCreate: false,
  };
}

async function findClientByPhone(
  normalizedPhone: string,
  originalPhone: string | null
) {
  const phoneValues = [...new Set([normalizedPhone, originalPhone].filter(Boolean))];

  const client = await prisma.client.findFirst({
    where: {
      OR: phoneValues.map((phone) => ({ phone })),
    },
    select: CLIENT_MERGE_SELECT,
  });

  if (!client) {
    return null;
  }

  return {
    client,
    matchedBy: 'phone' as const,
    skipSourceRecordCreate: false,
  };
}

async function createSourceRecordIfNeeded(
  tx: Prisma.TransactionClient,
  params: {
    clientId: string;
    source: LeadSourceType;
    externalId: string | null;
    normalizedEmail: string | null;
    normalizedPhone: string | null;
    payload: unknown;
  }
) {
  if (params.externalId) {
    const existing = await tx.clientSourceRecord.findUnique({
      where: {
        source_externalId: {
          source: params.source,
          externalId: params.externalId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }
  }

  await tx.clientSourceRecord.create({
    data: {
      clientId: params.clientId,
      source: params.source,
      externalId: params.externalId,
      normalizedEmail: params.normalizedEmail,
      normalizedPhone: params.normalizedPhone,
      payload: toJsonPayload(params.payload),
    },
  });
}

function getSourceLabel(source: LeadSourceType) {
  switch (source) {
    case LeadSourceType.GOOGLE_FORMS:
      return 'Google Forms';
    case LeadSourceType.PROFIT_PULSE_ALLY:
      return 'Profit Pulse Ally';
    case LeadSourceType.MANUAL:
      return 'Manual';
    case LeadSourceType.OTHER:
      return 'Other';
    default:
      return 'Other';
  }
}

function getMatchedByLabel(matchedBy: IngestExternalLeadResult['matchedBy']) {
  switch (matchedBy) {
    case 'source_external_id':
      return 'source external ID';
    case 'email':
      return 'email';
    case 'phone':
      return 'phone';
    case 'none':
      return 'no existing match';
    default:
      return 'no existing match';
  }
}

function buildIngestionActivityContent(
  action: 'created' | 'updated',
  source: LeadSourceType,
  matchedBy: IngestExternalLeadResult['matchedBy']
) {
  const sourceLabel = getSourceLabel(source);

  if (action === 'created') {
    return `Lead created from ${sourceLabel}.`;
  }

  return `Lead information received from ${sourceLabel} and matched by ${getMatchedByLabel(matchedBy)}.`;
}

async function createIngestionActivityLog(
  tx: Prisma.TransactionClient,
  clientId: string,
  content: string
) {
  await tx.clientActivityLog.create({
    data: {
      clientId,
      type: ActivityLogType.SYSTEM,
      content,
      userId: null,
    },
  });
}

export async function ingestExternalLead(
  input: IngestExternalLeadInput
): Promise<IngestExternalLeadResult> {
  const normalized = normalizeLeadFields(input);
  const externalId = compactString(input.externalId);
  const originalPhone = compactString(input.lead.phone);

  let match:
    | {
        client: ClientMergeSnapshot;
        matchedBy: 'source_external_id' | 'email' | 'phone';
        skipSourceRecordCreate: boolean;
      }
    | null = null;

  if (externalId) {
    match = await findClientBySourceExternalId(input.source, externalId);
  }

  if (!match && normalized.email) {
    match = await findClientByEmail(normalized.email);
  }

  if (!match && normalized.phone) {
    match = await findClientByPhone(normalized.phone, originalPhone);
  }

  if (match) {
    const result = await prisma.$transaction(async (tx) => {
      const updateData = mergeClientUpdateData(match.client, normalized);

      if (Object.keys(updateData).length > 0) {
        await tx.client.update({
          where: { id: match.client.id },
          data: updateData,
        });
      }

      if (!match.skipSourceRecordCreate) {
        await createSourceRecordIfNeeded(tx, {
          clientId: match.client.id,
          source: input.source,
          externalId,
          normalizedEmail: normalized.email,
          normalizedPhone: normalized.phone,
          payload: input.payload,
        });
      }

      await createIngestionActivityLog(
        tx,
        match.client.id,
        buildIngestionActivityContent(
          'updated',
          input.source,
          match.matchedBy
        )
      );

      return {
        ok: true as const,
        action: 'updated' as const,
        clientId: match.client.id,
        matchedBy: match.matchedBy,
      };
    });

    return result;
  }

  const created = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: buildCreateData(normalized, input.defaultLeadSource),
      select: { id: true },
    });

    await createSourceRecordIfNeeded(tx, {
      clientId: client.id,
      source: input.source,
      externalId,
      normalizedEmail: normalized.email,
      normalizedPhone: normalized.phone,
      payload: input.payload,
    });

    await createIngestionActivityLog(
      tx,
      client.id,
      buildIngestionActivityContent('created', input.source, 'none')
    );

    return {
      ok: true as const,
      action: 'created' as const,
      clientId: client.id,
      matchedBy: 'none' as const,
    };
  });

  return created;
}
