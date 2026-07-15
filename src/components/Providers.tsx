'use client';

import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';
import { DisplayDensityProvider } from '@/components/ui/DisplayDensityProvider';

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
      <DisplayDensityProvider>
        {children}
        <CommandPalette />
      </DisplayDensityProvider>
    </SessionProvider>
  );
}
