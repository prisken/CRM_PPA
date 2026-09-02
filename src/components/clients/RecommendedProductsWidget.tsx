'use client';

import { useCallback, useEffect, useState } from 'react';
import SectionCard from '@/components/ui/SectionCard';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getTightStackSpacingClass } from '@/components/ui/displayDensity';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type RecommendedProductsWidgetProps = {
  clientId: string;
  /** Bump when the recommendations widget adds a product (shared state). */
  refreshKey?: number;
};

/**
 * Curated shortlist: the rep's chosen products for this client.
 * Freely add/remove; additions can come from the recommendations widget
 * (via /api/clients/[id]/recommended-products PUT).
 */
export default function RecommendedProductsWidget({
  clientId,
  refreshKey = 0,
}: RecommendedProductsWidgetProps) {
  const { density } = useDisplayDensity();
  const spacing = getTightStackSpacingClass(density);

  const [products, setProducts] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Array<{ slug: string; name: string; category: string }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch(
        `/api/clients/${encodeURIComponent(clientId)}/recommended-products`
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.products)) {
        setProducts(data.products);
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [clientId]);

  useEffect(() => {
    load();
    authenticatedFetch('/api/products')
      .then((r) => r.json())
      .then((d) => {
        if (d.products) {
          setCatalog(d.products.map((pr: { slug: string; name: string; category: string }) => ({ slug: pr.slug, name: pr.name, category: pr.category })));
        }
      })
      .catch(() => {});
  }, [load, refreshKey]);

  const add = useCallback(
    async (name: string) => {
      if (products.includes(name)) return;
      const next = [...products, name];
      setProducts(next);
      setSaving(true);
      try {
        const res = await authenticatedFetch(
          `/api/clients/${encodeURIComponent(clientId)}/recommended-products`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: next }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to add');
        }
      } catch {
        setError('Failed to add');
      } finally {
        setSaving(false);
      }
    },
    [products, clientId]
  );

  const remove = useCallback(
    async (name: string) => {
      const next = products.filter((p) => p !== name);
      setProducts(next);
      setSaving(true);
      try {
        const res = await authenticatedFetch(
          `/api/clients/${encodeURIComponent(clientId)}/recommended-products`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: next }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to update');
        }
      } catch {
        setError('Failed to update');
      } finally {
        setSaving(false);
      }
    },
    [products, clientId]
  );

  return (
    <SectionCard
      title="Recommended products"
      description="Products you've shortlisted for this client — add from recommendations, remove anytime."
    >
      <div className={spacing}>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {!loaded ? (
          <div className="py-2 text-sm text-gray-500">Loading…</div>
        ) : (
          <>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">{products.length} shortlisted</span>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 active:bg-blue-100"
          >
            {pickerOpen ? 'Close' : '+ Add product'}
          </button>
        </div>

        {pickerOpen && (
          <div className="rounded-md border border-gray-200 bg-white p-2">
            <input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
              {catalog
                .filter(
                  (pr) =>
                    !products.includes(pr.name) &&
                    (pr.name.toLowerCase().includes(pickerQuery.toLowerCase()) ||
                      pr.category.toLowerCase().includes(pickerQuery.toLowerCase()))
                )
                .slice(0, 20)
                .map((pr) => (
                  <button
                    key={pr.slug}
                    type="button"
                    onClick={() => {
                      add(pr.name);
                      setPickerQuery('');
                    }}
                    className="block w-full truncate rounded px-2 py-1 text-left text-xs text-gray-700 hover:bg-blue-50 active:bg-blue-100 hover:text-blue-700"
                  >
                    {pr.name}
                    <span className="ml-1.5 text-[10px] text-gray-400">{pr.category}</span>
                  </button>
                ))}
              {catalog.length === 0 && (
                <p className="px-2 py-1 text-xs text-gray-400">Loading catalog…</p>
              )}
            </div>
          </div>
        )}

        {products.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
            No products shortlisted yet — add from recommendations or the picker above.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {products.map((name) => (
              <li
                key={name}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-xs font-medium text-gray-800">
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => remove(name)}
                  disabled={saving}
                  className="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        </>
        )}
        {saving && <p className="text-xs text-gray-400">saving…</p>}
      </div>
    </SectionCard>
  );
}
