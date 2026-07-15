export type DisplayDensity = 'compact' | 'comfortable';

export const DISPLAY_DENSITY_STORAGE_KEY = 'crm-display-density';

export function getDefaultDisplayDensity(role: string | undefined): DisplayDensity {
  return role === 'SUPER_ADMIN' ? 'compact' : 'comfortable';
}

export function readStoredDisplayDensity(): DisplayDensity | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(DISPLAY_DENSITY_STORAGE_KEY);
    if (value === 'compact' || value === 'comfortable') {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

export function writeStoredDisplayDensity(density: DisplayDensity) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(DISPLAY_DENSITY_STORAGE_KEY, density);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

export function getSectionCardHeaderPaddingClass(density: DisplayDensity) {
  return density === 'compact' ? 'px-3 py-2 sm:px-4' : 'px-4 py-3 sm:px-5';
}

export function getSectionCardBodyPaddingClass(density: DisplayDensity) {
  return density === 'compact' ? 'px-3 py-3 sm:px-4' : 'px-4 py-4 sm:px-5';
}

export function getWidgetPaddingClass(density: DisplayDensity) {
  return density === 'compact' ? 'p-3' : 'p-4';
}

export function getStackSpacingClass(density: DisplayDensity) {
  return density === 'compact' ? 'space-y-3' : 'space-y-4';
}

export function getTightStackSpacingClass(density: DisplayDensity) {
  return density === 'compact' ? 'space-y-2' : 'space-y-3';
}
