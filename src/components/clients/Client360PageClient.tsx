'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import ClientDetailsWidget from '@/components/clients/ClientDetailsWidget';
import { classifyImportantDateRecordType } from '@/lib/importantDateRecordType';
import AssignedTeamWidget from '@/components/clients/AssignedTeamWidget';
import CompanyHierarchyWidget from '@/components/clients/CompanyHierarchyWidget';
import ClientSourceRecordsWidget from '@/components/clients/ClientSourceRecordsWidget';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import DealInfoWidget, { type ClientDeal } from '@/components/clients/DealInfoWidget';
import WorkspacePanel from '@/components/clients/WorkspacePanel';
import {
  Client360RefreshProvider,
  useClient360Refresh,
} from '@/components/clients/client360Refresh';
import Logo from '@/components/Logo';
import StatusPill from '@/components/ui/StatusPill';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getStackSpacingClass } from '@/components/ui/displayDensity';
import type { MergeModalResult } from '@/components/admin/MergeClientsModal';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getStatusBadgeStyles, CLIENT_STAGES } from '@/lib/clientStages';
import { calculateUserClientCommissionShare } from '@/lib/commissionCalculations';
import type {
  Client360CompanyHierarchyData,
  Client360CoreData,
} from '@/lib/client360';
import type { DuplicateReviewClient } from '@/lib/leadDuplicates';
import {
  canUserAdvancePipelineStage,
  getNextPipelineStage,
  getPipelineAdvanceChecklist,
} from '@/lib/pipelinePermissions';

const PipelineStageAdvanceModal = dynamic(
  () => import('@/components/clients/PipelineStageAdvanceModal'),
  { ssr: false }
);

const ClientDeletionModal = dynamic(
  () => import('@/components/clients/ClientDeletionModal'),
  { ssr: false }
);

const ClientMergePickerModal = dynamic(
  () => import('@/components/clients/ClientMergePickerModal'),
  { ssr: false }
);

const MergeClientsModal = dynamic(
  () => import('@/components/admin/MergeClientsModal'),
  { ssr: false }
);

type Client360PageClientProps = {
  clientId: string;
  initialClient: Client360CoreData;
  initialDeals: ClientDeal[];
  initialHierarchy: Client360CompanyHierarchyData;
  canManageHierarchy?: boolean;
  dealAccess: {
    canView: boolean;
    canCreate: boolean;
    canManageAll: boolean;
    manageableDealIds: string[];
  };
  strategyAccess?: {
    canView: boolean;
    canManage: boolean;
  };
};

export default function Client360PageClient(props: Client360PageClientProps) {
  return (
    <Client360RefreshProvider>
      <Client360PageClientInner {...props} />
    </Client360RefreshProvider>
  );
}

function Client360PageClientInner({
  clientId,
  initialClient,
  initialDeals,
  initialHierarchy,
  canManageHierarchy = true,
  dealAccess,
  strategyAccess = { canView: true, canManage: false },
}: Client360PageClientProps) {
  const router = useRouter();
  const { profile } = useUserProfile();
  const { density } = useDisplayDensity();
  const { sliceKeys, refreshClient360Slices } = useClient360Refresh();
  const asideSpacingClass = getStackSpacingClass(density);
  // Mirror server props directly — core/team/`all` slices call router.refresh(),
  // which re-renders with new initial* props (no local copies / sync effect).
  const client = initialClient;
  const deals = initialDeals;
  const hierarchy = initialHierarchy;
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState(false);
  const [isMergePickerOpen, setIsMergePickerOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeClients, setMergeClients] = useState<DuplicateReviewClient[]>([]);

  /** Legacy full refresh — every slice key + router.refresh(). */
  const triggerDataRefresh = useCallback(() => {
    refreshClient360Slices(['all']);
  }, [refreshClient360Slices]);

  async function handleStageChange(newStatus: string) {
    if (!client || newStatus === client.status) {
      return;
    }

    setIsUpdatingStage(true);
    setStageError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to update status'
        );
      }

      setIsAdvanceModalOpen(false);
      triggerDataRefresh();
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsUpdatingStage(false);
    }
  }

  async function handleConfirmAdvance() {
    if (!client) {
      return;
    }

    const nextStatus = getNextPipelineStage(client.status);
    if (!nextStatus) {
      return;
    }

    await handleStageChange(nextStatus);
  }

  const handleCloseAdvanceModal = useCallback(() => {
    if (!isUpdatingStage) {
      setIsAdvanceModalOpen(false);
      setStageError(null);
    }
  }, [isUpdatingStage]);

  const handleOpenDeletionModal = useCallback(() => setIsDeletionModalOpen(true), []);
  const handleCloseDeletionModal = useCallback(() => setIsDeletionModalOpen(false), []);
  const handleDeleted = useCallback(() => router.push('/admin#master-pipeline'), [router]);
  const handleOpenMergePicker = useCallback(() => {
    setIsMergePickerOpen(true);
  }, []);
  const handleCloseMergePicker = useCallback(() => {
    setIsMergePickerOpen(false);
  }, []);
  const handleContinueToMerge = useCallback((clients: DuplicateReviewClient[]) => {
    setMergeClients(clients);
    setIsMergePickerOpen(false);
    setIsMergeModalOpen(true);
  }, []);
  const handleCloseMergeModal = useCallback(() => {
    setIsMergeModalOpen(false);
    setMergeClients([]);
  }, []);
  const handleMergeCompleted = useCallback(
    (summary: MergeModalResult) => {
      const canonicalClientId = summary.canonicalClientId;

      setIsMergeModalOpen(false);
      setMergeClients([]);
      setIsMergePickerOpen(false);

      if (canonicalClientId === clientId) {
        triggerDataRefresh();
        return;
      }

      router.push(`/clients/${canonicalClientId}`);
    },
    [clientId, router, triggerDataRefresh]
  );

  const hasClientAccess = useMemo(() => {
    if (!profile || !client) {
      return false;
    }

    if (profile.role === 'SUPER_ADMIN') {
      return true;
    }

    return client.assignedUsers.some((user) => user.user_id === profile.id);
  }, [profile, client]);

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
  const isStandardUser = profile?.role === 'STANDARD_USER';
  const userAssignmentRoles = useMemo(() => {
    if (!profile || !client) {
      return [];
    }

    return client.assignedUsers
      .filter((user) => user.user_id === profile.id)
      .map((user) => user.role);
  }, [profile, client]);

  const nextPipelineStage = client ? getNextPipelineStage(client.status) : null;
  const canAdvancePipelineStage =
    isStandardUser &&
    client !== null &&
    canUserAdvancePipelineStage(userAssignmentRoles, client.status);

  const advanceChecklist =
    client !== null ? getPipelineAdvanceChecklist(client.status) : [];
  const isRelationshipSpecialist = useMemo(() => {
    if (!profile || !client) {
      return false;
    }

    return client.assignedUsers.some(
      (user) => user.user_id === profile.id && user.role === 'RELATIONSHIP'
    );
  }, [profile, client]);

  const manageableDealIdSet = useMemo(
    () => new Set(dealAccess.manageableDealIds),
    [dealAccess.manageableDealIds]
  );

  const canManageDeal = useCallback(
    (dealId: string) =>
      dealAccess.canManageAll || manageableDealIdSet.has(dealId),
    [dealAccess.canManageAll, manageableDealIdSet]
  );

  const myClientCommissionPercentage = useMemo(() => {
    if (!profile || !client) {
      return 0;
    }

    return calculateUserClientCommissionShare(
      profile.id,
      client.assignedUsers
    );
  }, [profile, client]);

  const workspaceCurrentUser = useMemo(
    () =>
      profile
        ? {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role,
          }
        : null,
    [profile]
  );

  const teamCurrentUser = workspaceCurrentUser;

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin#master-pipeline"
                className="text-sm text-blue-600 hover:underline"
              >
                ← Back to list
              </Link>
              {isSuperAdmin && (
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                    More actions
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={handleOpenMergePicker}
                      className="block w-full px-3 py-2 text-left text-sm text-violet-800 hover:bg-violet-50"
                    >
                      Merge clients
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenDeletionModal}
                      className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                    >
                      Archive client
                    </button>
                  </div>
                </details>
              )}
            </div>
          </div>

          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="min-w-0 truncate text-xl font-bold text-gray-900 sm:text-2xl" title={client.name}>
              {client.name}
            </h1>
            {isSuperAdmin ? (
              <select
                value={client.status}
                onChange={(event) => handleStageChange(event.target.value)}
                disabled={isUpdatingStage}
                className={`rounded-full border-0 px-3 py-1 text-xs font-semibold focus:ring-2 focus:ring-blue-500 disabled:opacity-60 ${getStatusBadgeStyles(client.status)}`}
                aria-label="Pipeline stage"
              >
                {CLIENT_STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <StatusPill status={client.status} />
                {canAdvancePipelineStage && nextPipelineStage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStageError(null);
                      setIsAdvanceModalOpen(true);
                    }}
                    disabled={isUpdatingStage}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Move to Next Stage
                  </button>
                ) : null}
              </>
            )}
          </div>

          {stageError && (
            <p className="mt-2 text-sm text-red-600">{stageError}</p>
          )}

          {client.company && (
            <p className="mt-1 text-sm text-gray-500">{client.company}</p>
          )}
          {client.lead_source?.trim() && (
            <div className="mt-2">
              <LeadSourceBadges sources={[client.lead_source]} />
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 overflow-x-hidden px-4 py-6 sm:px-6 md:flex-row md:items-start lg:px-8">
        <div className="order-1 min-w-0 w-full md:flex-1 md:basis-0">
          <WorkspacePanel
            clientId={clientId}
            currentUser={workspaceCurrentUser}
            assignedUsers={client.assignedUsers}
            canPostNote={hasClientAccess}
            pageRefreshKey={sliceKeys.workspace}
            strategyAccess={strategyAccess}
          />
        </div>

        <aside
          className={`order-2 min-w-0 w-full shrink-0 md:w-[20rem] lg:w-[22rem] ${asideSpacingClass}`}
        >
          <ClientDetailsWidget
            clientId={clientId}
            isLead={classifyImportantDateRecordType(client.status) === 'Lead'}
            name={client.name}
            company={client.company}
            email={client.email}
            phone={client.phone}
            emails={client.emails}
            phones={client.phones}
            leadSource={client.lead_source}
            roleInCompany={client.roleInCompany}
            employeeCount={client.employeeCount}
            expectations={client.expectations}
            importantDates={client.importantDates}
            isSuperAdmin={isSuperAdmin}
            isRelationshipSpecialist={isRelationshipSpecialist}
          />
          {dealAccess.canView && (
            <DealInfoWidget
              clientId={clientId}
              initialDeals={deals}
              myClientCommissionPercentage={myClientCommissionPercentage}
              canCreateDeal={dealAccess.canCreate}
              canManageDeal={canManageDeal}
              assignedUsers={client.assignedUsers}
              currentUser={teamCurrentUser}
            />
          )}
          <AssignedTeamWidget
            clientId={clientId}
            assignedUsers={client.assignedUsers}
            currentUser={teamCurrentUser}
            onMutationSuccess={triggerDataRefresh}
          />
          <CompanyHierarchyWidget
            clientId={clientId}
            hierarchy={hierarchy}
            canManageEmployees={canManageHierarchy}
          />
          <ClientSourceRecordsWidget clientId={clientId} />
        </aside>
      </div>

      {client && nextPipelineStage && isAdvanceModalOpen ? (
        <PipelineStageAdvanceModal
          isOpen
          currentStatus={client.status}
          nextStatus={nextPipelineStage}
          checklist={advanceChecklist}
          isSubmitting={isUpdatingStage}
          error={stageError}
          onClose={handleCloseAdvanceModal}
          onConfirm={handleConfirmAdvance}
        />
      ) : null}

      {isSuperAdmin && isDeletionModalOpen && (
        <ClientDeletionModal
          isOpen
          clientId={clientId}
          clientName={client.name}
          onClose={handleCloseDeletionModal}
          onArchived={triggerDataRefresh}
          onDeleted={handleDeleted}
        />
      )}

      {isSuperAdmin && isMergePickerOpen && (
        <ClientMergePickerModal
          open
          anchorClient={client}
          anchorDealCount={deals.length}
          onClose={handleCloseMergePicker}
          onContinue={handleContinueToMerge}
        />
      )}

      {isSuperAdmin && isMergeModalOpen && mergeClients.length >= 2 && (
        <MergeClientsModal
          mode="manual-multi"
          clients={mergeClients}
          defaultCanonicalClientId={clientId}
          open
          onClose={handleCloseMergeModal}
          onMerged={handleMergeCompleted}
        />
      )}
    </main>
  );
}
