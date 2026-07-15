'use client';

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  getDefaultDisplayDensity,
  readStoredDisplayDensity,
  writeStoredDisplayDensity,
  type DisplayDensity,
} from '@/components/ui/displayDensity';

type DisplayDensityContextValue = {
  density: DisplayDensity;
  setDensity: (density: DisplayDensity) => void;
  ready: boolean;
};

const DisplayDensityContext = createContext<DisplayDensityContextValue | null>(null);

export function DisplayDensityProvider({ children }: { children: ReactNode }) {
  const { profile, loading: profileLoading } = useUserProfile();
  const [density, setDensityState] = useState<DisplayDensity>('compact');
  const [ready, setReady] = useState(false);
  const [hasStoredPreference, setHasStoredPreference] = useState(false);

  useEffect(() => {
    const stored = readStoredDisplayDensity();
    if (stored) {
      setDensityState(stored);
      setHasStoredPreference(true);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (hasStoredPreference || profileLoading) {
      return;
    }

    setDensityState(getDefaultDisplayDensity(profile?.role));
    setReady(true);
  }, [hasStoredPreference, profile?.role, profileLoading]);

  const setDensity = useCallback((nextDensity: DisplayDensity) => {
    setDensityState(nextDensity);
    setHasStoredPreference(true);
    writeStoredDisplayDensity(nextDensity);
    setReady(true);
  }, []);

  const value = useMemo(
    () => ({
      density,
      setDensity,
      ready,
    }),
    [density, ready, setDensity]
  );

  return (
    <DisplayDensityContext.Provider value={value}>
      {children}
    </DisplayDensityContext.Provider>
  );
}

export function useDisplayDensity() {
  const context = useContext(DisplayDensityContext);
  if (!context) {
    throw new Error('useDisplayDensity must be used within DisplayDensityProvider');
  }

  return context;
}

type DisplayDensityToggleProps = {
  className?: string;
  showOnMobile?: boolean;
};

export const DisplayDensityToggle = memo(function DisplayDensityToggle({
  className = '',
  showOnMobile = false,
}: DisplayDensityToggleProps) {
  const { density, setDensity } = useDisplayDensity();

  return (
    <div
      className={`${showOnMobile ? 'flex' : 'hidden sm:flex'} shrink-0 rounded-lg border border-gray-300 bg-white p-0.5 ${className}`.trim()}
      role="group"
      aria-label="View density"
    >
      <button
        type="button"
        onClick={() => setDensity('compact')}
        aria-pressed={density === 'compact'}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
          density === 'compact'
            ? 'bg-gray-900 text-white'
            : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        Compact
      </button>
      <button
        type="button"
        onClick={() => setDensity('comfortable')}
        aria-pressed={density === 'comfortable'}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
          density === 'comfortable'
            ? 'bg-gray-900 text-white'
            : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        Comfortable
      </button>
    </div>
  );
});
