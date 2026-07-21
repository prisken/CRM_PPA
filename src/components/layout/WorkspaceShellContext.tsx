'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'crm-sidebar-collapsed';

type WorkspaceShellContextValue = {
  desktopCollapsed: boolean;
  toggleDesktopCollapsed: () => void;
  mobileOpen: boolean;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
};

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null);

function readStoredSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredSidebarCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore storage failures.
  }
}

export function WorkspaceShellProvider({ children }: { children: ReactNode }) {
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDesktopCollapsed(readStoredSidebarCollapsed());
    setHydrated(true);
  }, []);

  const toggleDesktopCollapsed = useCallback(() => {
    setDesktopCollapsed((current) => {
      const next = !current;
      writeStoredSidebarCollapsed(next);
      return next;
    });
  }, []);

  const openMobileSidebar = useCallback(() => {
    setMobileOpen(true);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const toggleMobileSidebar = useCallback(() => {
    setMobileOpen((current) => !current);
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const value = useMemo(
    () => ({
      desktopCollapsed: hydrated ? desktopCollapsed : false,
      toggleDesktopCollapsed,
      mobileOpen,
      openMobileSidebar,
      closeMobileSidebar,
      toggleMobileSidebar,
    }),
    [
      closeMobileSidebar,
      desktopCollapsed,
      hydrated,
      mobileOpen,
      openMobileSidebar,
      toggleDesktopCollapsed,
      toggleMobileSidebar,
    ]
  );

  return (
    <WorkspaceShellContext.Provider value={value}>{children}</WorkspaceShellContext.Provider>
  );
}

export function useWorkspaceShell() {
  const context = useContext(WorkspaceShellContext);
  if (!context) {
    throw new Error('useWorkspaceShell must be used within WorkspaceShellProvider');
  }

  return context;
}
