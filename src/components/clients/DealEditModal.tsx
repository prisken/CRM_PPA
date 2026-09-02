'use client';

import {
  DealParticipantRole,
  DealStatus,
  DealType,
} from '@prisma/client';
import { useEffect, useMemo, useState } from 'react';
import type { AssignedUser, CurrentUserInfo } from '@/components/clients/AssignedTeamWidget';
import {
  calculateParticipantAmount,
  DEAL_PARTICIPANT_ROLE_LABELS,
  DEAL_TYPE_LABELS,
  getDealCommissionTemplate,
  sumParticipantPercents,
} from '@/lib/dealCommissionTemplates';
import type { DealResponse } from '@/lib/dealCalculations';
import {
  buildDefaultParticipantsForDeal,
  COMPANY_EXTERNAL_NAME,
  normalizeDealParticipantsInput,
  validateDealParticipantsForStatus,
  type NormalizedDealParticipant,
} from '@/lib/dealParticipants';
import {
  calculateParticipantCommissionAmount,
  calculateParticipantReturnableAmount,
} from '@/lib/dealParticipantCalculations';
import ParticipantUserPicker, {
  type ParticipantUserOption,
} from '@/components/clients/ParticipantUserPicker';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { formatMoneyRequired } from '@/lib/formatMoney';

const DEAL_STATUSES = [
  { value: DealStatus.PROPOSED, label: 'Proposed' },
  { value: DealStatus.WON, label: 'Won' },
  { value: DealStatus.LOST, label: 'Lost' },
  { value: DealStatus.ON_HOLD, label: 'On Hold' },
] as const;

const DEAL_TYPE_OPTIONS = Object.entries(DEAL_TYPE_LABELS).map(([value, label]) => ({
  value: value as DealType,
  label,
}));

const PARTICIPANT_ROLE_OPTIONS = Object.entries(DEAL_PARTICIPANT_ROLE_LABELS).map(
  ([value, label]) => ({
    value: value as DealParticipantRole,
    label,
  })
);

const PARTICIPANT_ADD_BUTTONS = [
  { role: DealParticipantRole.RELATIONSHIP, label: '+ Relationship Officer' },
  { role: DealParticipantRole.FOLLOW_UP, label: '+ Follow-up Officer' },
  { role: DealParticipantRole.DOCTOR, label: '+ Doctor / Specialist' },
  { role: DealParticipantRole.EXTERNAL_PARTNER, label: '+ External partner' },
  { role: DealParticipantRole.COMPANY, label: '+ PPA' },
] as const;

const EXTERNAL_PARTNER_NAME_PLACEHOLDER =
  'Marketing company, partner, vendor...';

type UserOption = ParticipantUserOption;

type ParticipantRow = {
  clientKey: string;
  role: DealParticipantRole;
  userId: string;
  externalName: string;
  commissionPercent: string;
  notes: string;
  isReturnableRequired: boolean;
  returnablePercent: string;
  returnableAmount: string;
};

const EMPTY_RETURNABLE_FIELDS = {
  isReturnableRequired: false,
  returnablePercent: '',
  returnableAmount: '',
};

type DealEditModalProps = {
  clientId: string;
  deal?: DealResponse | null;
  assignedUsers?: AssignedUser[];
  currentUser?: CurrentUserInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

let participantRowCounter = 0;

function createParticipantRowKey() {
  participantRowCounter += 1;
  return `participant-row-${participantRowCounter}`;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number) {
  return formatMoneyRequired(value);
}

function isExternalDealParticipantRole(role: DealParticipantRole) {
  return (
    role === DealParticipantRole.COMPANY ||
    role === DealParticipantRole.EXTERNAL_PARTNER
  );
}

function defaultExternalNameForRole(role: DealParticipantRole) {
  if (role === DealParticipantRole.COMPANY) {
    return COMPANY_EXTERNAL_NAME;
  }

  return '';
}

function normalizedToParticipantRow(
  participant: NormalizedDealParticipant
): ParticipantRow {
  return {
    clientKey: createParticipantRowKey(),
    role: participant.role,
    userId: participant.userId ?? '',
    externalName:
      participant.externalName ??
      defaultExternalNameForRole(participant.role),
    commissionPercent: String(participant.commissionPercent),
    notes: participant.notes ?? '',
    ...EMPTY_RETURNABLE_FIELDS,
  };
}

function dealParticipantsToRows(
  participants: DealResponse['participants']
): ParticipantRow[] {
  return participants.map((participant, index) => ({
    clientKey: participant.id ?? `existing-${index}`,
    role: participant.role,
    userId: participant.userId ?? '',
    externalName:
      participant.externalName ??
      defaultExternalNameForRole(participant.role),
    commissionPercent: String(participant.commissionPercent),
    notes: participant.notes ?? '',
    isReturnableRequired: participant.isReturnableRequired ?? false,
    returnablePercent:
      participant.returnablePercent !== null &&
      participant.returnablePercent !== undefined
        ? String(participant.returnablePercent)
        : '',
    returnableAmount:
      participant.returnableAmount !== null &&
      participant.returnableAmount !== undefined
        ? String(participant.returnableAmount)
        : '',
  }));
}

function buildUserOptions(
  assignedUsers: AssignedUser[],
  dealParticipants: DealResponse['participants'] | undefined,
  fetchedUsers: UserOption[]
) {
  const options = new Map<string, string>();

  for (const user of assignedUsers) {
    options.set(user.user_id, user.name);
  }

  for (const participant of dealParticipants ?? []) {
    if (participant.userId) {
      options.set(
        participant.userId,
        participant.userName ?? participant.userEmail ?? participant.userId
      );
    }
  }

  for (const user of fetchedUsers) {
    options.set(user.user_id, user.userName);
  }

  return Array.from(options.entries())
    .map(([user_id, userName]) => ({ user_id, userName }))
    .sort((a, b) => a.userName.localeCompare(b.userName));
}

function getDoctorSources(
  deal: DealResponse | null | undefined,
  assignedUsers: AssignedUser[]
) {
  const existingDoctors = (deal?.participants ?? []).filter(
    (participant) =>
      participant.role === DealParticipantRole.DOCTOR && participant.userId
  );

  if (existingDoctors.length > 0) {
    return existingDoctors.map((participant) => ({
      userId: participant.userId as string,
    }));
  }

  return assignedUsers
    .filter((user) => user.role === 'DOCTOR')
    .map((user) => ({ userId: user.user_id }));
}

function getParticipantUserFromRows(
  rows: ParticipantRow[],
  role: DealParticipantRole
) {
  const row = rows.find((entry) => entry.role === role && entry.userId);
  return row?.userId ?? null;
}

function getDoctorSourcesFromRows(
  currentRows: ParticipantRow[],
  deal: DealResponse | null | undefined,
  assignedUsers: AssignedUser[]
) {
  const currentDoctors = currentRows
    .filter(
      (row) => row.role === DealParticipantRole.DOCTOR && row.userId
    )
    .map((row) => ({ userId: row.userId }));

  if (currentDoctors.length > 0) {
    return currentDoctors;
  }

  return getDoctorSources(deal, assignedUsers);
}

function getExternalPartnerNameFromRows(currentRows: ParticipantRow[]) {
  const row = currentRows.find(
    (entry) =>
      entry.role === DealParticipantRole.EXTERNAL_PARTNER &&
      entry.externalName.trim()
  );
  return row?.externalName.trim() ?? null;
}

function buildTemplateParticipantRows({
  dealType,
  totalCommission,
  assignedUsers,
  deal,
  currentRows = [],
}: {
  dealType: DealType;
  totalCommission: number;
  assignedUsers: AssignedUser[];
  deal?: DealResponse | null;
  currentRows?: ParticipantRow[];
}) {
  const relationshipUserId =
    getParticipantUserFromRows(currentRows, DealParticipantRole.RELATIONSHIP) ??
    assignedUsers.find((user) => user.role === 'RELATIONSHIP')?.user_id ??
    null;
  const followUpUserId =
    getParticipantUserFromRows(currentRows, DealParticipantRole.FOLLOW_UP) ??
    assignedUsers.find((user) => user.role === 'ACCOUNT_SERVICE')?.user_id ??
    null;

  const participants = buildDefaultParticipantsForDeal({
    dealType,
    totalCommission,
    currentRelationshipAssignment: relationshipUserId
      ? { userId: relationshipUserId }
      : null,
    currentFollowUpAssignment: followUpUserId
      ? { userId: followUpUserId }
      : null,
    selectedDoctors: getDoctorSourcesFromRows(currentRows, deal, assignedUsers),
    externalPartnerName: getExternalPartnerNameFromRows(currentRows),
  });

  return participants.map(normalizedToParticipantRow);
}

function initializeParticipantRows({
  deal,
  dealType,
  totalCommission,
  assignedUsers,
}: {
  deal?: DealResponse | null;
  dealType: DealType;
  totalCommission: number;
  assignedUsers: AssignedUser[];
}) {
  if (deal?.participants?.length) {
    return dealParticipantsToRows(deal.participants);
  }

  return buildTemplateParticipantRows({
    dealType,
    totalCommission,
    assignedUsers,
    deal,
  });
}

function participantRowsToPayload(rows: ParticipantRow[]) {
  return rows.map((row) => {
    const usesExternal = isExternalDealParticipantRole(row.role);
    const isDoctor = row.role === DealParticipantRole.DOCTOR;
    const isReturnableRequired = isDoctor && row.isReturnableRequired;
    const trimmedExternalName = row.externalName.trim();

    return {
      role: row.role,
      userId: usesExternal ? null : row.userId || null,
      externalName: usesExternal
        ? trimmedExternalName ||
          defaultExternalNameForRole(row.role) ||
          null
        : null,
      commissionPercent: Number(row.commissionPercent),
      notes: row.notes.trim() || null,
      isReturnableRequired,
      returnablePercent:
        isReturnableRequired && row.returnablePercent.trim()
          ? Number(row.returnablePercent)
          : null,
      returnableAmount:
        isReturnableRequired && row.returnableAmount.trim()
          ? Number(row.returnableAmount)
          : null,
    };
  });
}

function validateReturnableRowsForSubmit(
  rows: ParticipantRow[],
  status: DealStatus,
  totalCommission: number
) {
  if (status !== DealStatus.WON) {
    return null;
  }

  const participants = normalizeDealParticipantsInput(
    participantRowsToPayload(rows),
    { totalCommission }
  );
  const validation = validateDealParticipantsForStatus({
    status,
    totalCommission,
    participants,
  });

  if (!validation.ok) {
    return validation.errors[0] ?? 'Validation failed';
  }

  return null;
}

function getDoctorPoolPercent(dealType: DealType, rows: ParticipantRow[]) {
  const templatePool = getDealCommissionTemplate(dealType)
    .filter(
      (line) =>
        line.role === DealParticipantRole.DOCTOR && line.commissionPercent > 0
    )
    .reduce((sum, line) => sum + line.commissionPercent, 0);

  if (templatePool > 0) {
    return templatePool;
  }

  return rows
    .filter((row) => row.role === DealParticipantRole.DOCTOR)
    .reduce((sum, row) => sum + (Number(row.commissionPercent) || 0), 0);
}

function splitDoctorPoolEvenly(rows: ParticipantRow[], dealType: DealType) {
  const doctorIndexes = rows
    .map((row, index) => (row.role === DealParticipantRole.DOCTOR ? index : -1))
    .filter((index) => index >= 0);

  if (doctorIndexes.length <= 1) {
    return rows;
  }

  const poolPercent = getDoctorPoolPercent(dealType, rows);
  const evenShare = roundPercent(poolPercent / doctorIndexes.length);
  let allocated = 0;

  return rows.map((row, index) => {
    if (row.role !== DealParticipantRole.DOCTOR) {
      return row;
    }

    const doctorPosition = doctorIndexes.indexOf(index);
    const isLast = doctorPosition === doctorIndexes.length - 1;
    const percent = isLast
      ? roundPercent(poolPercent - allocated)
      : evenShare;

    if (!isLast) {
      allocated += evenShare;
    }

    return {
      ...row,
      commissionPercent: String(percent),
    };
  });
}

export default function DealEditModal({
  clientId,
  deal = null,
  assignedUsers = [],
  currentUser = null,
  isOpen,
  onClose,
  onSaved,
}: DealEditModalProps) {
  const formKey = isOpen ? (deal?.id ?? 'new') : 'closed';

  return (
    <DealEditModalForm
      key={formKey}
      clientId={clientId}
      deal={deal}
      assignedUsers={assignedUsers}
      currentUser={currentUser}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function DealEditModalForm({
  clientId,
  deal,
  assignedUsers = [],
  currentUser,
  isOpen,
  onClose,
  onSaved,
}: DealEditModalProps) {
  const isEditing = deal !== null;

  const [name, setName] = useState(deal?.name ?? '');
  const [dealValue, setDealValue] = useState(
    deal !== null && deal !== undefined ? String(deal.dealValue) : ''
  );
  const [totalCommission, setTotalCommission] = useState(
    deal !== null && deal !== undefined ? String(deal.totalCommission) : ''
  );
  const [status, setStatus] = useState<DealStatus>(deal?.status ?? DealStatus.PROPOSED);
  const [dealType, setDealType] = useState<DealType>(deal?.dealType ?? DealType.CUSTOM);
  const [participantRows, setParticipantRows] = useState<ParticipantRow[]>([]);
  const [fetchedUsers, setFetchedUsers] = useState<UserOption[]>([]);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [dealTypeChanged, setDealTypeChanged] = useState(false);
  const [templateApplyConfirmVisible, setTemplateApplyConfirmVisible] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericTotalCommission = Number(totalCommission) || 0;

  const userOptions = useMemo(
    () => buildUserOptions(assignedUsers, deal?.participants, fetchedUsers),
    [assignedUsers, deal?.participants, fetchedUsers]
  );

  const totalPercent = useMemo(
    () =>
      sumParticipantPercents(
        participantRows.map((row) => ({
          commissionPercent: Number(row.commissionPercent) || 0,
        }))
      ),
    [participantRows]
  );

  const isTotalValid = Math.abs(totalPercent - 100) <= 0.01;
  const doctorRowCount = participantRows.filter(
    (row) => row.role === DealParticipantRole.DOCTOR
  ).length;

  const participantValidation = useMemo(() => {
    const participants = normalizeDealParticipantsInput(
      participantRowsToPayload(participantRows),
      { totalCommission: numericTotalCommission }
    );

    return validateDealParticipantsForStatus({
      status,
      totalCommission: numericTotalCommission,
      participants,
      allowIncomplete:
        status === DealStatus.PROPOSED || status === DealStatus.ON_HOLD,
    });
  }, [participantRows, numericTotalCommission, status]);

  const effectiveCommissionTotal = participantValidation.effectiveCommissionTotal;
  const unallocatedCommission = participantValidation.unallocatedCommission;
  const isOverAllocated = unallocatedCommission < -0.01;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initialTotalCommission =
      deal !== null && deal !== undefined ? Number(deal.totalCommission) : 0;
    const initialDealType = deal?.dealType ?? DealType.CUSTOM;

    setName(deal?.name ?? '');
    setDealValue(deal !== null && deal !== undefined ? String(deal.dealValue) : '');
    setTotalCommission(
      deal !== null && deal !== undefined ? String(deal.totalCommission) : ''
    );
    setStatus(deal?.status ?? DealStatus.PROPOSED);
    setDealType(initialDealType);
    setParticipantRows(
      initializeParticipantRows({
        deal,
        dealType: initialDealType,
        totalCommission: initialTotalCommission,
        assignedUsers,
      })
    );
    setDealTypeChanged(false);
    setTemplateApplyConfirmVisible(false);
    setError(null);
  }, [isOpen, deal, assignedUsers]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function fetchParticipantUsers() {
      setUsersLoadError(null);

      const res = await authenticatedFetch(
        `/api/clients/${clientId}/deals/participant-users`
      );

      if (cancelled) {
        return;
      }

      if (!res.ok) {
        setFetchedUsers([]);
        setUsersLoadError(
          res.status === 403
            ? 'User picker limited to assigned team members.'
            : 'Could not load active users. Using assigned team members only.'
        );
        return;
      }

      const data = await res.json();
      if (Array.isArray(data.users)) {
        setFetchedUsers(data.users);
      }
    }

    fetchParticipantUsers();

    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId]);

  if (!isOpen) {
    return null;
  }

  function handleDealTypeChange(nextDealType: DealType) {
    setDealType(nextDealType);
    setDealTypeChanged(nextDealType !== (deal?.dealType ?? DealType.CUSTOM));
    setTemplateApplyConfirmVisible(false);
  }

  function executeApplyTemplate() {
    setParticipantRows((currentRows) =>
      buildTemplateParticipantRows({
        dealType,
        totalCommission: numericTotalCommission,
        assignedUsers,
        deal,
        currentRows,
      })
    );
    setDealTypeChanged(false);
    setTemplateApplyConfirmVisible(false);
  }

  function handleApplyTemplateClick() {
    if (participantRows.length > 0) {
      setTemplateApplyConfirmVisible(true);
      return;
    }

    executeApplyTemplate();
  }

  function updateParticipantRow(
    clientKey: string,
    updates: Partial<ParticipantRow>
  ) {
    setParticipantRows((currentRows) =>
      currentRows.map((row) =>
        row.clientKey === clientKey ? { ...row, ...updates } : row
      )
    );
  }

  function addParticipantRow(role: DealParticipantRole) {
    setParticipantRows((currentRows) => [
      ...currentRows,
      {
        clientKey: createParticipantRowKey(),
        role,
        userId: '',
        externalName: defaultExternalNameForRole(role),
        commissionPercent: '0',
        notes: '',
        ...EMPTY_RETURNABLE_FIELDS,
      },
    ]);
  }

  function removeParticipantRow(clientKey: string) {
    setParticipantRows((currentRows) =>
      currentRows.filter((row) => row.clientKey !== clientKey)
    );
  }

  function handleSplitDoctorPool() {
    setParticipantRows((currentRows) =>
      splitDoctorPoolEvenly(currentRows, dealType)
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status === DealStatus.WON && !isTotalValid) {
      setError('Won deals require participant percentages to total 100%.');
      return;
    }

    const returnableError = validateReturnableRowsForSubmit(
      participantRows,
      status,
      numericTotalCommission
    );
    if (returnableError) {
      setError(returnableError);
      return;
    }

    if (status === DealStatus.WON && !participantValidation.ok) {
      setError(participantValidation.errors[0] ?? 'Validation failed');
      return;
    }

    if (isOverAllocated) {
      setError(
        `Participant commission amounts exceed deal total by ${formatMoney(
          Math.abs(unallocatedCommission)
        )}.`
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      dealValue: Number(dealValue),
      totalCommission: Number(totalCommission),
      status,
      dealType,
      participants: participantRowsToPayload(participantRows),
    };

    try {
      const url = isEditing
        ? `/api/clients/${clientId}/deals/${deal!.id}`
        : `/api/clients/${clientId}/deals`;
      const res = await authenticatedFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const details = Array.isArray(data.details)
          ? data.details.join(' ')
          : '';
        throw new Error(
          [typeof data.error === 'string' ? data.error : 'Failed to save deal', details]
            .filter(Boolean)
            .join(' ')
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save deal');
    } finally {
      setIsSubmitting(false);
    }
  }

  const submitDisabled =
    isSubmitting ||
    (status === DealStatus.WON && (!isTotalValid || !participantValidation.ok)) ||
    isOverAllocated;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center py-4">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
          <div className="shrink-0 border-b border-gray-100 px-4 py-4 sm:px-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {isEditing ? 'Edit Deal' : 'Add Deal'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Configure deal value, deal participants (commission split), and status.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              <div>
                <label
                  htmlFor="deal-name"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Name
                </label>
                <input
                  id="deal-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  placeholder="e.g. Annual retainer"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="deal-value"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Deal Value
                  </label>
                  <input
                    id="deal-value"
                    type="number"
                    min={0}
                    step="0.01"
                    value={dealValue}
                    onChange={(event) => setDealValue(event.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="deal-total-commission"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Total Commission
                  </label>
                  <input
                    id="deal-total-commission"
                    type="number"
                    min={0}
                    step="0.01"
                    value={totalCommission}
                    onChange={(event) => setTotalCommission(event.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="deal-type"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Deal Type
                  </label>
                  <select
                    id="deal-type"
                    value={dealType}
                    onChange={(event) =>
                      handleDealTypeChange(event.target.value as DealType)
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  >
                    {DEAL_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="deal-status"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Status
                  </label>
                  <select
                    id="deal-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as DealStatus)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  >
                    {DEAL_STATUSES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">
                      Deal Participants
                    </h4>
                    <p className="text-xs text-gray-500">Commission split</p>
                    <p
                      className={`text-sm font-medium ${
                        status === DealStatus.WON
                          ? isTotalValid
                            ? 'text-green-700'
                            : 'text-red-600'
                          : isTotalValid
                            ? 'text-green-700'
                            : 'text-amber-600'
                      }`}
                    >
                      Percent total: {totalPercent}%
                    </p>
                    <p
                      className={`text-xs ${
                        isOverAllocated ? 'font-medium text-red-600' : 'text-gray-600'
                      }`}
                    >
                      Effective commission: {formatMoney(effectiveCommissionTotal)}
                      {unallocatedCommission > 0.01
                        ? ` · Unallocated: ${formatMoney(unallocatedCommission)}`
                        : isOverAllocated
                          ? ` · Overallocated: ${formatMoney(
                              Math.abs(unallocatedCommission)
                            )}`
                          : ''}
                    </p>
                    {status === DealStatus.PROPOSED && !isTotalValid && (
                      <p className="text-xs text-amber-600">
                        Percentages do not total 100%. You can save as proposed, but won deals
                        require 100%.
                      </p>
                    )}
                    {participantValidation.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {participantValidation.warnings.slice(0, 4).map((warning) => (
                          <li key={warning} className="text-xs text-amber-700">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    )}
                    {status === DealStatus.WON &&
                      participantValidation.errors.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {participantValidation.errors.slice(0, 4).map((validationError) => (
                            <li key={validationError} className="text-xs text-red-600">
                              {validationError}
                            </li>
                          ))}
                        </ul>
                      )}
                    {dealTypeChanged && (
                      <p className="text-xs text-amber-700">
                        Deal type changed. Apply the {DEAL_TYPE_LABELS[dealType]}{' '}
                        template to update participant percentages.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleApplyTemplateClick}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 active:bg-blue-100"
                    >
                      Apply {DEAL_TYPE_LABELS[dealType]} template
                    </button>
                    {doctorRowCount > 1 && (
                      <button
                        type="button"
                        onClick={handleSplitDoctorPool}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                      >
                        Split doctor pool evenly
                      </button>
                    )}
                    {PARTICIPANT_ADD_BUTTONS.map((button) => (
                      <button
                        key={button.role}
                        type="button"
                        onClick={() => addParticipantRow(button.role)}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                      >
                        {button.label}
                      </button>
                    ))}
                  </div>
                </div>

                {usersLoadError && (
                  <p className="mt-2 text-xs text-amber-700">{usersLoadError}</p>
                )}

                {templateApplyConfirmVisible && (
                  <div
                    role="status"
                    className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
                  >
                    <p className="text-xs text-amber-900">
                      Applying this template will replace current participant
                      percentages. Continue?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={executeApplyTemplate}
                        className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 active:bg-amber-900"
                      >
                        Continue
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemplateApplyConfirmVisible(false)}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 active:bg-amber-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
                        <th className="py-2 pr-2">Role</th>
                        <th className="py-2 pr-2">Assignee</th>
                        <th className="py-2 pr-2">%</th>
                        <th className="py-2 pr-2">Amount</th>
                        <th className="py-2 pr-2">Returnable</th>
                        <th className="py-2 pr-2">Notes</th>
                        <th className="py-2 text-right"> </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {participantRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="py-4 text-center text-sm text-gray-500"
                          >
                            No participants yet. Apply a template or add rows.
                          </td>
                        </tr>
                      ) : (
                        participantRows.map((row) => (
                          <ParticipantRowEditor
                            key={row.clientKey}
                            row={row}
                            userOptions={userOptions}
                            totalCommission={numericTotalCommission}
                            onChange={(updates) =>
                              updateParticipantRow(row.clientKey, updates)
                            }
                            onRemove={() => removeParticipantRow(row.clientKey)}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitDisabled}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
              >
                {isSubmitting ? 'Saving...' : isEditing ? 'Save Deal' : 'Add Deal'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

type ParticipantRowEditorProps = {
  row: ParticipantRow;
  userOptions: UserOption[];
  totalCommission: number;
  onChange: (updates: Partial<ParticipantRow>) => void;
  onRemove: () => void;
};

function ParticipantRowEditor({
  row,
  userOptions,
  totalCommission,
  onChange,
  onRemove,
}: ParticipantRowEditorProps) {
  const usesExternal = isExternalDealParticipantRole(row.role);
  const commissionAmount = calculateParticipantAmount(
    totalCommission,
    Number(row.commissionPercent) || 0
  );

  function handleRoleChange(nextRole: DealParticipantRole) {
    onChange({
      role: nextRole,
      externalName: defaultExternalNameForRole(nextRole),
      userId: isExternalDealParticipantRole(nextRole) ? '' : row.userId,
      ...(nextRole === DealParticipantRole.DOCTOR
        ? {}
        : EMPTY_RETURNABLE_FIELDS),
    });
  }

  const doctorCommissionAmount = calculateParticipantCommissionAmount(
    totalCommission,
    {
      commissionPercent: Number(row.commissionPercent) || 0,
      commissionAmount: commissionAmount,
      isCommissionable: true,
    }
  );

  const estimatedReturnable =
    row.role === DealParticipantRole.DOCTOR
      ? calculateParticipantReturnableAmount(totalCommission, {
          role: row.role,
          userId: row.userId || null,
          commissionPercent: Number(row.commissionPercent) || 0,
          commissionAmount: doctorCommissionAmount,
          isCommissionable: true,
          isReturnableRequired: row.isReturnableRequired,
          returnablePercent: row.returnablePercent.trim()
            ? Number(row.returnablePercent)
            : null,
          returnableAmount: row.returnableAmount.trim()
            ? Number(row.returnableAmount)
            : null,
        })
      : null;

  const hasBothReturnableInputs =
    row.returnablePercent.trim().length > 0 &&
    row.returnableAmount.trim().length > 0;

  return (
    <tr>
      <td className="py-2 pr-2 align-top">
        <select
          value={row.role}
          onChange={(event) =>
            handleRoleChange(event.target.value as DealParticipantRole)
          }
          className="w-full min-w-[8rem] rounded border border-gray-300 px-2 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
        >
          {PARTICIPANT_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>

      <td className="py-2 pr-2 align-top">
        {usesExternal ? (
          <input
            type="text"
            value={row.externalName}
            onChange={(event) => onChange({ externalName: event.target.value })}
            readOnly={row.role === DealParticipantRole.COMPANY}
            placeholder={
              row.role === DealParticipantRole.EXTERNAL_PARTNER
                ? EXTERNAL_PARTNER_NAME_PLACEHOLDER
                : undefined
            }
            className="w-full min-w-[12rem] rounded border border-gray-300 px-2 py-1.5 text-xs read-only:bg-gray-100 bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
          />
        ) : (
          <ParticipantUserPicker
            users={userOptions}
            value={row.userId}
            onChange={(userId) => onChange({ userId })}
          />
        )}
      </td>

      <td className="py-2 pr-2 align-top">
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={row.commissionPercent}
          onChange={(event) => onChange({ commissionPercent: event.target.value })}
          className="w-20 rounded border border-gray-300 px-2 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
        />
      </td>

      <td className="py-2 pr-2 align-top text-xs text-gray-700">
        {formatMoney(commissionAmount)}
      </td>

      <td className="py-2 pr-2 align-top">
        {row.role === DealParticipantRole.DOCTOR ? (
          <div className="min-w-[12rem] space-y-2">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={row.isReturnableRequired}
                onChange={(event) =>
                  onChange({
                    isReturnableRequired: event.target.checked,
                    ...(event.target.checked
                      ? {}
                      : {
                          returnablePercent: '',
                          returnableAmount: '',
                        }),
                  })
                }
              />
              Returnable required
            </label>

            {row.isReturnableRequired && (
              <>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={row.returnablePercent}
                  onChange={(event) =>
                    onChange({ returnablePercent: event.target.value })
                  }
                  placeholder="Returnable % of commission"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.returnableAmount}
                  onChange={(event) =>
                    onChange({ returnableAmount: event.target.value })
                  }
                  placeholder="Fixed returnable amount"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                />
                {hasBothReturnableInputs && (
                  <p className="text-[11px] text-amber-700">
                    Fixed amount overrides percentage.
                  </p>
                )}
                <p className="text-[11px] text-gray-600">
                  Commission: {formatMoney(doctorCommissionAmount)}
                  {estimatedReturnable !== null
                    ? ` · Est. returnable: ${formatMoney(estimatedReturnable)}`
                    : ''}
                </p>
              </>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      <td className="py-2 pr-2 align-top">
        <input
          type="text"
          value={row.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="Optional"
          className="w-full min-w-[8rem] rounded border border-gray-300 px-2 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
        />
      </td>

      <td className="py-2 text-right align-top">
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 active:bg-red-100"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}
