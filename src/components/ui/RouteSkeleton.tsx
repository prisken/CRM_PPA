/**
 * Route-loading skeleton (UI pass §4.2). Server-safe — no hooks, no auth.
 * Approximates the WorkspaceShell chrome (top bar + content cards) so an
 * instant navigation lands on a shape, not a blank void.
 */
export default function RouteSkeleton({
  title = '',
  rows = 6,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <div className="min-h-dvh bg-gray-100">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white/95">
        <div className="flex min-h-14 items-center gap-3 px-3 py-2.5 sm:px-5">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-gray-200 lg:hidden" />
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          <div className="ml-auto h-9 w-9 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>

      {/* Content frame */}
      <div className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-3 sm:px-5 sm:py-5">
        {title ? (
          <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        ) : null}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-4 rounded-xl border border-gray-200 bg-white p-4"
            style={{ opacity: Math.max(0.35, 1 - i * 0.1) }}
          >
            <div className="h-11 w-11 shrink-0 rounded-lg bg-gray-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/5 rounded bg-gray-200" />
              <div className="h-3 w-3/5 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-20 shrink-0 rounded-lg bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
