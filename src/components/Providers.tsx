'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { DisplayDensityProvider } from '@/components/ui/DisplayDensityProvider';
import NavigationProgress from '@/components/ui/NavigationProgress';

const CommandPalette = dynamic(() => import('@/components/CommandPalette'), {
  ssr: false,
});

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  // Safari unlock: :active does nothing on iOS until a touchstart listener
  // exists anywhere. Keep this empty listener for the app lifetime. (UI §3.1)
  useEffect(() => {
    document.addEventListener('touchstart', () => {}, { passive: true });
  }, []);

  return (
    <SessionProvider>
      <DisplayDensityProvider>
        {children}
        <CommandPalette />
        <NavigationProgress />
      </DisplayDensityProvider>
    </SessionProvider>
  );
}
