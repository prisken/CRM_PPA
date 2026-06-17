'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import ClientDetailsWidget from '@/components/clients/ClientDetailsWidget';
import AssignedTeamWidget from '@/components/clients/AssignedTeamWidget';
import CompanyHierarchyWidget from '@/components/clients/CompanyHierarchyWidget';
import ClientDeletionModal from '@/components/clients/ClientDeletionModal';
import DealInfoWidget from '@/components/clients/DealInfoWidget';
import PipelineStageAdvanceModal from '@/components/clients/PipelineStageAdvanceModal';
import WorkspacePanel from '@/components/clients/WorkspacePanel';
import Logo from '@/components/Logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatClientStage, getStatusBadgeStyles, CLIENT_STAGES } from '@/lib/clientStages';
import { calculateUserClientCommissionShare } from '@/lib/commissionCalculations';
import {
  canUserAdvancePipelineStage,
  getNextPipelineStage,
  getPipelineAdvanceChecklist,
} from '@/lib/pipelinePermissions';

type ImportantDate = {
  label: string;
  date: string;
};

type Client360Data = {
  client_id: string;
  name: string;
  company: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  lead_source: string | null;
  roleInCompany: string | null;
  employeeCount: number | null;
  expectations: string | null;
  importantDates: ImportantDate[];
  assignedUsers: {
    assignment_id: string;
    user_id: string;
    name: string;
    role: string;
  }[];
  documents: {
    id: string;
    fileName: string;
    downloadUrl: string;
    uploadedAt: string;
  }[];
};

export default function Client360Page({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { profile } = useUserProfile();
  const [client, setClient] = useState<Client360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState(false);
  const clientRef = useRef<Client360Data | null>(null);

  clientRef.current = client;

  const triggerDataRefresh = () => {
    setRefreshKey((prevKey) => prevKey + 1);
  };

  useEffect(() => {
    setClient(null);
    setLoading(true);
    setError(null);
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;

    async function loadClient() {
      const showFullPageLoader = clientRef.current === null;
      if (showFullPageLoader) {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await fetch(`/api/clients/${clientId}`, {
          credentials: 'same-origin',
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 401) {
            throw new Error('Please log in to view this client.');
          }
          if (res.status === 404) {
            throw new Error(
              typeof data.error === 'string' ? data.error : 'Client not found'
            );
          }
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Failed to load client'
          );
        }

        const data = await res.json();
        if (!cancelled) {
          setClient(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load client');
        }
      } finally {
        if (!cancelled && showFullPageLoader) {
          setLoading(false);
        }
      }
    }

    loadClient();

    return () => {
      cancelled = true;
    };
  }, [clientId, refreshKey]);

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

  const isDoctorSpecialist = useMemo(() => {
    if (!profile || !client) {
      return false;
    }

    return client.assignedUsers.some(
      (user) => user.user_id === profile.id && user.role === 'DOCTOR'
    );
  }, [profile, client]);

  const myClientCommissionPercentage = useMemo(() => {
    if (!profile || !client) {
      return 0;
    }

    return calculateUserClientCommissionShare(
      profile.id,
      client.assignedUsers
    );
  }, [profile, client]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading client...</p>
      </main>
    );
  }

  if (error || !client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <div className="max-w-md text-center">
          <p className="text-red-600">{error ?? 'Client not found'}</p>
          <Link
            href="/admin#master-pipeline"
            className="mt-4 inline-block text-sm text-blue-600 hover:underline"
          >
            ← Back to list
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin#master-pipeline"
                className="text-sm text-blue-600 hover:underline"
              >
                ← Back to list
              </Link>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setIsDeletionModalOpen(true)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Archive Client
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
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
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeStyles(client.status)}`}
                >
                  {formatClientStage(client.status)}
                </span>
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
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:items-start lg:px-8">
        <div className="min-w-0 md:flex-[2]">
          <WorkspacePanel
            clientId={clientId}
            currentUser={
              profile
                ? {
                    id: profile.id,
                    name: profile.name,
                    email: profile.email,
                    role: profile.role,
                  }
                : null
            }
            assignedUsers={client.assignedUsers}
            canPostNote={hasClientAccess}
            refreshKey={refreshKey}
            onMutationSuccess={triggerDataRefresh}
          />
        </div>

        <aside className="min-w-0 w-full space-y-4 md:flex-1">
          <ClientDetailsWidget
            clientId={clientId}
            name={client.name}
            company={client.company}
            email={client.email}
            phone={client.phone}
            leadSource={client.lead_source}
            roleInCompany={client.roleInCompany}
            employeeCount={client.employeeCount}
            expectations={client.expectations}
            importantDates={client.importantDates}
            isSuperAdmin={isSuperAdmin}
            isRelationshipSpecialist={isRelationshipSpecialist}
            onMutationSuccess={triggerDataRefresh}
          />
          {(isSuperAdmin || isDoctorSpecialist) && (
            <DealInfoWidget
              clientId={clientId}
              myClientCommissionPercentage={myClientCommissionPercentage}
              canManage={isSuperAdmin || isDoctorSpecialist}
              refreshKey={refreshKey}
              onMutationSuccess={triggerDataRefresh}
            />
          )}
          <AssignedTeamWidget
            clientId={clientId}
            assignedUsers={client.assignedUsers}
            currentUser={
              profile
                ? {
                    id: profile.id,
                    name: profile.name,
                    email: profile.email,
                    role: profile.role,
                  }
                : null
            }
            onMutationSuccess={triggerDataRefresh}
          />
          <CompanyHierarchyWidget
            clientId={clientId}
            refreshKey={refreshKey}
            onMutationSuccess={triggerDataRefresh}
          />
        </aside>
      </div>

      {client && nextPipelineStage ? (
        <PipelineStageAdvanceModal
          isOpen={isAdvanceModalOpen}
          currentStatus={client.status}
          nextStatus={nextPipelineStage}
          checklist={advanceChecklist}
          isSubmitting={isUpdatingStage}
          error={stageError}
          onClose={() => {
            if (!isUpdatingStage) {
              setIsAdvanceModalOpen(false);
              setStageError(null);
            }
          }}
          onConfirm={handleConfirmAdvance}
        />
      ) : null}

      {isSuperAdmin && (
        <ClientDeletionModal
          isOpen={isDeletionModalOpen}
          clientId={clientId}
          clientName={client.name}
          onClose={() => setIsDeletionModalOpen(false)}
          onArchived={triggerDataRefresh}
          onDeleted={() => router.push('/admin#master-pipeline')}
        />
      )}
    </main>
  );
}
