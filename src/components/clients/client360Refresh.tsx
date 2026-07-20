'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

/**
 * Client 360 refresh slices. Mutations request only what they changed.
 * `all` preserves the legacy full fan-out (every slice key + `router.refresh`).
 */
export const CLIENT_360_REFRESH_SLICES = [
  'core',
  'deals',
  'team',
  'hierarchy',
  'sourceRecords',
  'workspace',
  'importantDates',
] as const;

export type Client360RefreshSlice = (typeof CLIENT_360_REFRESH_SLICES)[number];

export type Client360RefreshRequest = Client360RefreshSlice | 'all';

export type Client360SliceKeys = Record<Client360RefreshSlice, number>;

const INITIAL_SLICE_KEYS: Client360SliceKeys = {
  core: 0,
  deals: 0,
  team: 0,
  hierarchy: 0,
  sourceRecords: 0,
  workspace: 0,
  importantDates: 0,
};

/** Slices whose visible data still comes from RSC server props today. */
const SLICES_REQUIRING_ROUTER_REFRESH: ReadonlySet<Client360RefreshSlice> =
  new Set(['core', 'team']);

function expandRefreshRequests(
  requests: readonly Client360RefreshRequest[]
): Set<Client360RefreshSlice> {
  const expanded = new Set<Client360RefreshSlice>();

  for (const request of requests) {
    if (request === 'all') {
      for (const slice of CLIENT_360_REFRESH_SLICES) {
        expanded.add(slice);
      }
      continue;
    }

    expanded.add(request);
  }

  return expanded;
}

export type Client360RefreshContextValue = {
  sliceKeys: Client360SliceKeys;
  /**
   * Request refresh for one or more slices.
   * - `all`: bump every slice key + `router.refresh()` (legacy full refresh).
   * - `core` / `team`: bump key(s) + `router.refresh()` (server props).
   * - other slices: bump key only (widgets refetch via `sliceKeys`).
   */
  refreshClient360Slices: (slices: readonly Client360RefreshRequest[]) => void;
};

const Client360RefreshContext =
  createContext<Client360RefreshContextValue | null>(null);

export function Client360RefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [sliceKeys, setSliceKeys] =
    useState<Client360SliceKeys>(INITIAL_SLICE_KEYS);

  const refreshClient360Slices = useCallback(
    (slices: readonly Client360RefreshRequest[]) => {
      if (slices.length === 0) {
        return;
      }

      const expanded = expandRefreshRequests(slices);
      if (expanded.size === 0) {
        return;
      }

      setSliceKeys((current) => {
        const next = { ...current };
        for (const slice of expanded) {
          next[slice] = current[slice] + 1;
        }
        return next;
      });

      let needsRouterRefresh = false;
      for (const slice of expanded) {
        if (SLICES_REQUIRING_ROUTER_REFRESH.has(slice)) {
          needsRouterRefresh = true;
          break;
        }
      }

      // `all` always includes core/team via expand, so this covers legacy full refresh.
      if (needsRouterRefresh) {
        router.refresh();
      }
    },
    [router]
  );

  const value = useMemo(
    () => ({
      sliceKeys,
      refreshClient360Slices,
    }),
    [sliceKeys, refreshClient360Slices]
  );

  return (
    <Client360RefreshContext.Provider value={value}>
      {children}
    </Client360RefreshContext.Provider>
  );
}

/** Requires {@link Client360RefreshProvider} (Client 360 page). */
export function useClient360Refresh(): Client360RefreshContextValue {
  const value = useContext(Client360RefreshContext);
  if (!value) {
    throw new Error(
      'useClient360Refresh must be used within Client360RefreshProvider'
    );
  }
  return value;
}

/** Safe outside Client 360 (e.g. Lead Preview Important Dates). */
export function useClient360RefreshOptional(): Client360RefreshContextValue | null {
  return useContext(Client360RefreshContext);
}
