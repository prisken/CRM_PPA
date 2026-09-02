'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type AuthRequiredMessageProps = {
  message?: string;
};

export default function AuthRequiredMessage({
  message = 'Please log in to view this page.',
}: AuthRequiredMessageProps) {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  async function handleBackToSignIn() {
    setIsRedirecting(true);

    try {
      await supabase.auth.signOut();
      localStorage.removeItem('token');
    } catch {
      // Continue to login even if sign-out fails so the user isn't stuck.
    }

    router.replace('/login');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <p className="mb-4 text-lg text-gray-600">{message}</p>
        <button
          type="button"
          onClick={handleBackToSignIn}
          disabled={isRedirecting}
          className="inline-block rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRedirecting ? 'Redirecting...' : 'Back to Sign In'}
        </button>
      </div>
    </main>
  );
}
