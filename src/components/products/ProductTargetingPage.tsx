'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type ProductLite = {
  slug: string;
  name: string;
  category: string;
  price_tier: string;
  features: string[];
  gap?: string;
};

type ClientMatch = {
  client_id: string;
  client_name: string;
  company: string | null;
  score: number;
  matched_traits: string[];
  persona_overlap: string[];
  trait_count: number;
};

const TIER_STYLES: Record<string, string> = {
  budget: 'bg-green-100 text-green-800',
  mid: 'bg-gray-100 text-gray-700',
  premium: 'bg-amber-100 text-amber-800',
};

export default function ProductTargetingPage() {
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ProductLite | null>(null);
  const [matches, setMatches] = useState<ClientMatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoredCount, setScoredCount] = useState(0);

  useEffect(() => {
    authenticatedFetch('/api/products')
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load products');
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }, [products, search]);

  const pickProduct = useCallback(async (p: ProductLite) => {
    setSelected(p);
    setMatches(null);
    setLoadingMatches(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `/api/products/${encodeURIComponent(p.slug)}/matching-clients?top=20`
      );
      const data = await res.json();
      if (res.ok) {
        setMatches(data.matches || []);
        setScoredCount(data.scored_clients || 0);
      } else {
        setError(data.error || 'Failed to find matching clients');
      }
    } catch {
      setError('Failed to find matching clients');
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Product targeting</h1>
            <p className="text-sm text-gray-500">
              Pick a product — see which clients are the best fit (reverse of the client recommendation engine).
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6 md:flex-row md:items-start">
        {/* Left: product picker */}
        <div className="w-full md:w-[22rem] md:shrink-0">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto">
              {loading ? (
                <div className="py-6 text-center text-sm text-gray-400">Loading products…</div>
              ) : filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No products match.</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => pickProduct(p)}
                    className={`block w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      selected?.slug === p.slug
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-800">{p.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          TIER_STYLES[p.price_tier] || TIER_STYLES.mid
                        }`}
                      >
                        {p.price_tier}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-gray-500">{p.category}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: matching clients */}
        <div className="min-w-0 flex-1">
          {!selected ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
              Select a product on the left to see which clients fit it.
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-gray-900">{selected.name}</h2>
                  <div className="text-xs text-gray-500">
                    {selected.category} · {selected.price_tier} tier
                    {selected.gap ? ` · ${selected.gap}` : ''}
                  </div>
                </div>
                {!loadingMatches && matches && (
                  <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {matches.length} fit{matches.length === 1 ? '' : 's'} of {scoredCount} profiled clients
                  </span>
                )}
              </div>

              {selected.features.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  <span className="font-medium text-gray-700">Key features:</span>{' '}
                  {selected.features.join('; ')}
                </div>
              )}

              <div className="mt-4">
                {loadingMatches ? (
                  <div className="py-8 text-center text-sm text-gray-400">Scoring clients…</div>
                ) : error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </div>
                ) : matches && matches.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">
                    No profiled clients match this product yet — pick traits on client pages first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {matches?.map((m, i) => (
                      <Link
                        key={m.client_id}
                        href={`/clients/${m.client_id}`}
                        className="block rounded-md border border-gray-200 bg-gray-50 p-3 transition-colors hover:border-blue-300 hover:bg-blue-50 active:bg-blue-100/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-gray-900">
                              {i + 1}. {m.client_name}
                            </span>
                            {m.company && (
                              <span className="ml-2 text-xs text-gray-500">{m.company}</span>
                            )}
                          </div>
                          <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                            {m.score}
                          </span>
                        </div>
                        {m.matched_traits.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {m.matched_traits.map((t) => (
                              <span
                                key={t}
                                className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] text-blue-700"
                              >
                                {t.replace(/_/g, ' ')}
                              </span>
                            ))}
                            {m.persona_overlap.length > 0 && (
                              <span className="rounded-full border border-purple-200 bg-white px-2 py-0.5 text-[10px] text-purple-600">
                                persona: {m.persona_overlap.join(', ')}
                              </span>
                            )}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
