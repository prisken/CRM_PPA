/**
 * Phase 2L / 2M — Client 360 client-side load guards (pure, testable).
 *
 * These encode first-paint vs deferred-fetch contracts so UI widgets and docs
 * stay aligned. They are NOT authorization helpers.
 *
 * Layer reminder:
 * - RSC page flags (`resolveClient360PageAccess`) = UI convenience only
 * - API `resolveClient360Context` / route require* = request auth source of truth
 * - Mutations = final authority on write paths
 */

/** Whether the source-records effect body should call GET …/source-records. */
export function shouldFetchClient360SourceRecords(input: {
  hasExpanded: boolean;
}): boolean {
  return input.hasExpanded;
}

/**
 * Collapse → expand handler for the defaultCollapsed source-records card.
 * Expanding sets `hasExpanded` permanently for this mount (collapse does not reset it).
 */
export function applySourceRecordsCollapsedChange(input: {
  collapsed: boolean;
  hasExpanded: boolean;
}): { hasExpanded: boolean } {
  if (!input.collapsed) {
    return { hasExpanded: true };
  }
  return { hasExpanded: input.hasExpanded };
}

/**
 * Simulate React effect deps `[clientId, hasExpanded, sliceKey]` for source-records.
 * Counts how many times a fetch would run across a sequence of UI events.
 */
export function countClient360SourceRecordsFetches(
  events: Array<
    | { type: 'mount'; clientId?: string; sliceKey?: number }
    | { type: 'expand' }
    | { type: 'collapse' }
    | { type: 'reexpand' }
    | { type: 'sliceBump' }
    | { type: 'clientChange'; clientId: string }
  >
): number {
  let clientId = 'client-a';
  let hasExpanded = false;
  let sliceKey = 0;
  let lastEffectSignature: string | null = null;
  let fetchCount = 0;

  const runEffectIfDepsChanged = () => {
    const signature = `${clientId}|${hasExpanded}|${sliceKey}`;
    if (signature === lastEffectSignature) {
      return;
    }
    lastEffectSignature = signature;
    if (shouldFetchClient360SourceRecords({ hasExpanded })) {
      fetchCount += 1;
    }
  };

  for (const event of events) {
    switch (event.type) {
      case 'mount':
        clientId = event.clientId ?? clientId;
        sliceKey = event.sliceKey ?? sliceKey;
        hasExpanded = false;
        lastEffectSignature = null;
        runEffectIfDepsChanged();
        break;
      case 'expand':
      case 'reexpand': {
        const next = applySourceRecordsCollapsedChange({
          collapsed: false,
          hasExpanded,
        });
        hasExpanded = next.hasExpanded;
        runEffectIfDepsChanged();
        break;
      }
      case 'collapse': {
        const next = applySourceRecordsCollapsedChange({
          collapsed: true,
          hasExpanded,
        });
        hasExpanded = next.hasExpanded;
        runEffectIfDepsChanged();
        break;
      }
      case 'sliceBump':
        sliceKey += 1;
        runEffectIfDepsChanged();
        break;
      case 'clientChange':
        clientId = event.clientId;
        runEffectIfDepsChanged();
        break;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
      }
    }
  }

  return fetchCount;
}

/** SectionCard toggle: flip collapsed and always notify listeners. */
export function nextSectionCardCollapsedState(currentCollapsed: boolean): {
  collapsed: boolean;
  notifiedCollapsed: boolean;
} {
  const collapsed = !currentCollapsed;
  return { collapsed, notifiedCollapsed: collapsed };
}
