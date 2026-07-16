import { logClientSystemEvent } from '@/lib/authHelpers';

export type StrategyActivityEntity =
  | 'strategy_plan'
  | 'strategy_step'
  | 'strategy_connection'
  | 'strategy_expense'
  | 'strategy_projection_milestone';

export type StrategyActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'archived';

const ENTITY_LABELS: Record<StrategyActivityEntity, string> = {
  strategy_plan: 'Strategy plan',
  strategy_step: 'Strategy step',
  strategy_connection: 'Strategy connection',
  strategy_expense: 'Strategy expense',
  strategy_projection_milestone: 'Strategy projection milestone',
};

type LogClientStrategyEventInput = {
  clientId: string;
  userId: string;
  strategyPlanId: string;
  entityType: StrategyActivityEntity;
  action: StrategyActivityAction;
  /** Short human subject (plan/step/expense title, or connection summary). */
  label: string;
};

/**
 * Logs Client Strategy Builder mutations via the existing client activity log.
 *
 * Stored on ClientActivityLog:
 * - clientId, userId (columns)
 * - type SYSTEM
 * - content includes readable message + strategyPlanId / entity / action
 */
export async function logClientStrategyEvent(
  input: LogClientStrategyEventInput
) {
  const { clientId, userId, strategyPlanId, entityType, action, label } =
    input;

  const entityLabel = ENTITY_LABELS[entityType];
  const trimmedLabel = label.trim() || 'Untitled';
  const content = `${entityLabel} ${action}: ${trimmedLabel} (strategyPlanId: ${strategyPlanId}; entity: ${entityType}; action: ${action})`;

  await logClientSystemEvent(clientId, content, userId);
}
