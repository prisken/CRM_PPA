import { notFound, redirect } from 'next/navigation';
import Client360PageClient from '@/components/clients/Client360PageClient';
import {
  canAccessClientHierarchy,
  canReadClientCore,
  getAuthenticatedUser,
  getDealAccessForClient,
} from '@/lib/authHelpers';
import {
  canManageClientStrategy,
  canViewClientStrategy,
} from '@/lib/clientStrategyPermissions';
import {
  getClient360CoreData,
  getClient360DealsData,
  getClient360CompanyHierarchyData,
  type Client360CompanyHierarchyData,
} from '@/lib/client360';

function emptyHierarchy(
  company: string | null,
  employeeCount: number | null
): Client360CompanyHierarchyData {
  return {
    company,
    employeeCount,
    colleagues: [],
  };
}

export default async function Client360Page({ clientId }: { clientId: string }) {
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    redirect('/login');
  }

  const canRead = await canReadClientCore(
    auth.user.id,
    auth.user.role,
    clientId
  );
  if (!canRead) {
    redirect('/dashboard');
  }

  const core = await getClient360CoreData(clientId);

  if (!core) {
    notFound();
  }

  const dealAccess = await getDealAccessForClient(
    auth.user.id,
    auth.user.role,
    clientId
  );

  const canViewHierarchy = await canAccessClientHierarchy(
    auth.user.id,
    auth.user.role,
    clientId
  );

  const [canViewStrategy, canManageStrategy] = await Promise.all([
    canViewClientStrategy(auth.user, clientId),
    canManageClientStrategy(auth.user, clientId),
  ]);

  const [deals, hierarchy] = await Promise.all([
    dealAccess.canView ? getClient360DealsData(clientId) : Promise.resolve([]),
    canViewHierarchy
      ? getClient360CompanyHierarchyData(clientId, {
          company: core.company,
          employeeCount: core.employeeCount,
        })
      : Promise.resolve(
          emptyHierarchy(core.company, core.employeeCount)
        ),
  ]);

  if (!hierarchy) {
    notFound();
  }

  return (
    <Client360PageClient
      clientId={clientId}
      initialClient={core}
      initialDeals={deals}
      initialHierarchy={hierarchy}
      canManageHierarchy={canViewHierarchy}
      dealAccess={dealAccess}
      strategyAccess={{
        canView: canViewStrategy,
        canManage: canManageStrategy,
      }}
    />
  );
}
