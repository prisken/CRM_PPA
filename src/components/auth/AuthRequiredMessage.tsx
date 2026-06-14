import Link from 'next/link';

type AuthRequiredMessageProps = {
  message?: string;
};

export default function AuthRequiredMessage({
  message = 'Please log in to view this page.',
}: AuthRequiredMessageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <p className="mb-4 text-lg text-gray-600">{message}</p>
        <Link
          href="/login"
          className="inline-block rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Back to Sign In
        </Link>
      </div>
    </main>
  );
}
