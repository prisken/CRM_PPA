'use client';

import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';

const CommandPalette = dynamic(() => import('@/components/CommandPalette'), {
  ssr: false,
});

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      {children}
      <CommandPalette />
    </SessionProvider>
  );
}
