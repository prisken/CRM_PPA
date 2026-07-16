import { notFound, redirect } from 'next/navigation';
import ClientStrategyOverviewPageShell from '@/components/clients/ClientStrategyOverviewPageShell';
import { getAuthenticatedUser } from '@/lib/authHelpers';
import { getClient360CoreData } from '@/lib/client360';
import { canViewClientStrategy } from '@/lib/clientStrategyPermissions';
import {
  formatStrategyPlanDetail,
  loadStrategyPlanDetail,
} from '@/lib/clientStrategyPlans';
import { toClientStrategyReportPlanInput } from '@/lib/clientStrategyReportHelpers';

export const dynamic = 'force-dynamic';

export default async function StrategyPlanOverviewPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id: clientId, planId } = await params;

  const auth = await getAuthenticatedUser();
  if (auth.error) {
    redirect('/login');
  }

  const canView = await canViewClientStrategy(auth.user, clientId);
  if (!canView) {
    redirect('/dashboard');
  }

  const [planLoad, core] = await Promise.all([
    loadStrategyPlanDetail(clientId, planId),
    getClient360CoreData(clientId),
  ]);

  if ('error' in planLoad || !core) {
    notFound();
  }

  const plan = formatStrategyPlanDetail(planLoad.plan);

  return (
    <ClientStrategyOverviewPageShell
      clientId={clientId}
      planId={planId}
      clientName={core.name}
      planStatus={plan.status}
      reportPlan={toClientStrategyReportPlanInput(plan)}
    />
  );
}
