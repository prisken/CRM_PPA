import type { ReactNode } from 'react';

export type WorkspaceUserRole = 'SUPER_ADMIN' | 'STANDARD_USER' | (string & {});

export type WorkspaceNavBadge = {
  label: string;
  tone?: 'neutral' | 'info' | 'warning' | 'danger';
};

export type WorkspaceNavItem = {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: WorkspaceNavBadge;
  /** When omitted, the item is shown for all roles. */
  roles?: WorkspaceUserRole[];
  /** Opens in a new tab when true. */
  external?: boolean;
  /** When true, only an exact pathname match counts as active. */
  exact?: boolean;
};

export type WorkspaceNavSection = {
  id: string;
  label?: string;
  items: WorkspaceNavItem[];
};

export type WorkspaceNavConfig = {
  sections: WorkspaceNavSection[];
};
