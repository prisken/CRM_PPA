'use client';

import { useEffect, useState } from 'react';

const LARGE_SCREEN_MEDIA_QUERY = '(min-width: 1024px)';

export function useIsLargeScreen() {
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(LARGE_SCREEN_MEDIA_QUERY);
    const update = () => setIsLargeScreen(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isLargeScreen;
}
