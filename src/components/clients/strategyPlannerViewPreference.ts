export type StrategyPlannerView = 'board' | 'list' | 'projection';

export const STRATEGY_PLANNER_VIEW_STORAGE_KEY =
  'crm-client-strategy-planner-view';

export const DEFAULT_STRATEGY_PLANNER_VIEW: StrategyPlannerView = 'board';

type Listener = () => void;

const listeners = new Set<Listener>();

function emitStrategyPlannerViewChange() {
  for (const listener of listeners) {
    listener();
  }
}

function isStrategyPlannerView(value: string): value is StrategyPlannerView {
  return value === 'board' || value === 'list' || value === 'projection';
}

export function readStoredStrategyPlannerView(): StrategyPlannerView | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(
      STRATEGY_PLANNER_VIEW_STORAGE_KEY
    );
    if (value && isStrategyPlannerView(value)) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

export function writeStoredStrategyPlannerView(view: StrategyPlannerView) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STRATEGY_PLANNER_VIEW_STORAGE_KEY, view);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }

  emitStrategyPlannerViewChange();
}

/** Same-tab + cross-tab subscription for useSyncExternalStore. */
export function subscribeStrategyPlannerView(listener: Listener) {
  listeners.add(listener);

  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (
      event.key === STRATEGY_PLANNER_VIEW_STORAGE_KEY ||
      event.key === null
    ) {
      listener();
    }
  };

  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getStrategyPlannerViewSnapshot(): StrategyPlannerView {
  return readStoredStrategyPlannerView() ?? DEFAULT_STRATEGY_PLANNER_VIEW;
}

/** SSR / hydration: always Board to avoid mismatch with server HTML. */
export function getStrategyPlannerViewServerSnapshot(): StrategyPlannerView {
  return DEFAULT_STRATEGY_PLANNER_VIEW;
}
