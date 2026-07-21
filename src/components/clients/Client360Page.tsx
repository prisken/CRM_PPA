import { notFound, redirect } from 'next/navigation';
import Client360PageClient from '@/components/clients/Client360PageClient';
import { getAuthenticatedUser } from '@/lib/authHelpers';
import { resolveClient360PageAccess } from '@/lib/client360PageAccess';
import {
  getClient360CoreData,
  getClient360DealsData,
  getClient360CompanyHierarchyData,
  type Client360CompanyHierarchyData,
} from '@/lib/client360';
import { timeAsync } from '@/lib/performance';

function emptyHierarchy(
  company: string | null,
  employeeCount: number | null
): Client360CompanyHierarchyData {
  return {
    company,
    employeeCount,
    colleagues: [],
    colleagueCount: 0,
    colleaguesHasMore: false,
  };
}

/**
 * Phase 2K: auth → resolve-once page access → core + conditional deals/hierarchy.
 * API routes remain the authority for mutations; flags here are UI-only.
 */
export default async function Client360Page({ clientId }: { clientId: string }) {
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    redirect('/login');
  }

  const access = await resolveClient360PageAccess(auth.user, clientId);
  if (!access) {
    // Hide existence — same as prior canReadClientCore deny → dashboard.
    redirect('/dashboard');
  }

  const page = await timeAsync(
    'client360:rscPageLoad',
    async () => {
      const core = await getClient360CoreData(clientId);

      if (!core) {
        return null;
      }

      const [deals, hierarchy] = await Promise.all([
        access.dealAccess.canView
          ? getClient360DealsData(clientId)
          : Promise.resolve([]),
        access.canViewHierarchy
          ? getClient360CompanyHierarchyData(clientId, {
              company: core.company,
              employeeCount: core.employeeCount,
            })
          : Promise.resolve(
              emptyHierarchy(core.company, core.employeeCount)
            ),
      ]);

      if (!hierarchy) {
        return null;
      }

      return {
        core,
        deals,
        hierarchy,
        canViewHierarchy: access.canViewHierarchy,
        dealAccess: access.dealAccess,
        strategyAccess: access.strategyAccess,
      };
    },
    {
      getMeta: (result) => ({
        clientId,
        found: result !== null,
        dealCount: result?.deals.length ?? 0,
        colleagueCount: result?.hierarchy.colleagueCount ?? 0,
        colleaguesReturned: result?.hierarchy.colleagues.length ?? 0,
        canViewDeals: result?.dealAccess.canView ?? false,
        canViewHierarchy: result?.canViewHierarchy ?? false,
      }),
    }
  );

  if (!page) {
    notFound();
  }

  return (
    <Client360PageClient
      clientId={clientId}
      initialClient={page.core}
      initialDeals={page.deals}
      initialHierarchy={page.hierarchy}
      canManageHierarchy={page.canViewHierarchy}
      dealAccess={page.dealAccess}
      strategyAccess={page.strategyAccess}
    />
  );
}
