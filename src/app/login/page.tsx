'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import AppLink, { signalNavStart } from '@/components/ui/app-link';
import Spinner from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error(signInError);
        setError(signInError.message);
        return;
      }

      const userId = signInData.user?.id;
      if (!userId) {
        setError('Unable to verify account. Please try again.');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('User')
        .select('status')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error(profileError);
        await supabase.auth.signOut();
        setError('Unable to verify account status. Please try again.');
        return;
      }

      if (profile?.status === 'DEACTIVATED') {
        await supabase.auth.signOut();
        setError('Your account has been deactivated. Contact an administrator.');
        return;
      }

      const tokenResponse = await fetch('/api/auth/token', {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (tokenResponse.ok) {
        const tokenData = (await tokenResponse.json()) as { token?: string };
        if (tokenData.token) {
          localStorage.setItem('token', tokenData.token);
        }
      } else {
        localStorage.removeItem('token');
      }

      signalNavStart();
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <Logo className="mx-auto mb-6 h-10 w-auto" />

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Welcome back</h1>
          <p className="mt-2 text-sm text-gray-500">Sign in to your CRM account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className="flex min-h-12 w-full select-none items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:scale-[0.99] active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none"
          >
            {isLoading ? (
              <>
                <Spinner className="h-4 w-4" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-center text-sm text-red-600">{error}</p>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <AppLink
            href="/signup"
            className="rounded font-medium text-blue-600 hover:underline active:text-blue-800"
          >
            Sign up
          </AppLink>
        </p>
      </div>
    </main>
  );
}
