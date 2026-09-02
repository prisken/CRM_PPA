'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

type DownloadLink = {
  label: string;
  href: string;
};

export default function WidgetDownloadMenu({ links }: { links: DownloadLink[] }) {
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
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 active:bg-gray-200 hover:text-gray-700"
        aria-label="Download options"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              download
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
