import { notFound, redirect } from 'next/navigation';
import Client360PageClient from '@/components/clients/Client360PageClient';
import { getAuthenticatedUser } from '@/lib/authHelpers';
import {
  getClient360CoreData,
  getClient360DealsData,
  getClient360CompanyHierarchyData,
} from '@/lib/client360';

export default async function Client360Page({ clientId }: { clientId: string }) {
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    redirect('/login');
  }

  const core = await getClient360CoreData(clientId);

  if (!core) {
    notFound();
  }

  const canViewDeals =
    auth.user.role === 'SUPER_ADMIN' ||
    core.assignedUsers.some(
      (assignment) =>
        assignment.user_id === auth.user.id && assignment.role === 'DOCTOR'
    );

  const [deals, hierarchy] = await Promise.all([
    canViewDeals ? getClient360DealsData(clientId) : Promise.resolve([]),
    getClient360CompanyHierarchyData(clientId, {
      company: core.company,
      employeeCount: core.employeeCount,
    }),
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
    />
  );
}
