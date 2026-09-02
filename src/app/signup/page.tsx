import { redirect } from 'next/navigation';
import SignUpPage from '@/components/auth/SignUpPage';

export const dynamic = 'force-dynamic';

/**
 * Public signup is disabled in production (SIMPLE_MODE default on).
 * Users are created by the super admin via User Management.
 * Flip SIMPLE_MODE=false to re-enable self-registration.
 */
export default function SignUpRoute() {
  if (process.env.SIMPLE_MODE !== 'false') {
    redirect('/login');
  }
  return <SignUpPage />;
}
