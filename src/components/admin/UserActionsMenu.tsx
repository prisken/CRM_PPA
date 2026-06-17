'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

type UserActionsMenuProps = {
  disabled?: boolean;
  onDeactivate: () => void;
  onDelete: () => void;
};

export default function UserActionsMenu({
  disabled = false,
  onDeactivate,
  onDelete,
}: UserActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="User actions"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
            onClick={() => {
              setOpen(false);
              onDeactivate();
            }}
          >
            Deactivate
          </button>
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Permanently Delete
          </button>
        </div>
      )}
    </div>
  );
}
