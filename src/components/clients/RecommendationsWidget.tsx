'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '@/components/ui/SectionCard';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getTightStackSpacingClass } from '@/components/ui/displayDensity';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import traitVocabulary from '@/lib/data/trait-vocabulary.json';
import questionnaireData from '@/lib/data/trait-questionnaire.json';
import { VOCABULARY } from '@/lib/recommendationEngine';

type TraitGroup = { trait: string; label: string }[];
type Vocabulary = { groups: Record<string, TraitGroup>; labels: Record<string, string> };

type Question = {
  id: string;
  section?: string;
  question: string;
  options: { label: string; add?: string[]; remove?: string[] }[];
};

type Recommendation = {
  product: string;
  category: string;
  price_tier: string;
  score: number;
  stars?: number;
  matched_traits: string[];
  persona_overlap: string[];
  features: string[];
  fit: string;
  product_fit?: { gap?: string; best_for?: string; price_position?: string };
  sales_plan?: {
    why_this_client: string;
    sell_points: string[];
    hook: string;
    script: string;
    next_step: string;
  };
};

type RecommendationsWidgetProps = {
  clientId: string;
  clientName?: string;
};

const VOCAB = traitVocabulary as Vocabulary;
const QUESTIONS = questionnaireData.questions as Question[];
const GROUP_ORDER = [
  'Demographics',
  'Family',
  'Finances',
  'Coverage',
  'Health',
  'Goals',
  'Lifestyle',
];

export default function RecommendationsWidget({
  clientId,
  clientName,
}: RecommendationsWidgetProps) {
  const { density } = useDisplayDensity();
  const spacing = getTightStackSpacingClass(density);

  const [mode, setMode] = useState<'questions' | 'picker'>('questions');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [traits, setTraits] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(GROUP_ORDER.filter((_, i) => i !== 0))
  );
  const [error, setError] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [compareCat, setCompareCat] = useState<string | null>(null);
  const [comparisons, setComparisons] = useState<Record<string, ComparisonBundle>>({});

  const knownTraits = useMemo(() => new Set<string>(VOCABULARY.keys()), []);

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch(
        `/api/clients/${encodeURIComponent(clientId)}/profile-traits`
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.traits)) {
        setTraits(data.traits);
        if (data.traits.length > 0) {
          setMode('picker');
        }
      }
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveTraits = useCallback(
    async (next: string[]) => {
      setSaving(true);
      try {
        const res = await authenticatedFetch(
          `/api/clients/${encodeURIComponent(clientId)}/profile-traits`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ traits: next }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to save traits');
        }
      } catch {
        setError('Failed to save traits');
      } finally {
        setSaving(false);
      }
    },
    [clientId]
  );

  const runRecommendations = useCallback(async () => {
    setLoadingRecs(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `/api/clients/${encodeURIComponent(clientId)}/recommendations?top=5`
      );
      const data = await res.json();
      if (res.ok) {
        setRecs(data.recommendations || []);
        if (Array.isArray(data.recommended_products)) {
          setShortlist(data.recommended_products);
        }
        if (data.comparisons && typeof data.comparisons === 'object') {
          setComparisons(data.comparisons);
        }
      } else {
        setError(data.error || 'Failed to load recommendations');
      }
    } catch {
      setError('Failed to load recommendations');
    } finally {
      setLoadingRecs(false);
    }
  }, [clientId]);

  /** Questionnaire → traits: union of selected options' add, minus their remove. */
  const applyAnswers = useCallback(async () => {
    const next = new Set<string>();
    const removed = new Set<string>();
    for (const q of QUESTIONS) {
      const opt = q.options.find((o) => o.label === answers[q.id]);
      if (!opt) continue;
      for (const t of opt.add || []) next.add(t);
      for (const t of opt.remove || []) removed.add(t);
    }
    const final = [...next].filter((t) => !removed.has(t));
    setTraits(final);
    setMode('picker');
    await saveTraits(final);
  }, [answers, saveTraits]);

  const toggleTrait = useCallback(
    async (trait: string) => {
      const next = traits.includes(trait)
        ? traits.filter((t) => t !== trait)
        : [...traits, trait];
      setTraits(next);
      await saveTraits(next);
    },
    [traits, saveTraits]
  );

  const addToShortlist = useCallback(
    async (name: string) => {
      if (shortlist.includes(name)) return;
      const next = [...shortlist, name];
      setShortlist(next);
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
          setError(data.error || 'Failed to add to shortlist');
        }
      } catch {
        setError('Failed to add to shortlist');
      }
    },
    [shortlist, clientId]
  );

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(group)) nextSet.delete(group);
      else nextSet.add(group);
      return nextSet;
    });
  }, []);

  const traitLabel = useCallback((trait: string) => {
    return VOCAB.labels?.[trait] || trait;
  }, []);

  const answeredCount = Object.keys(answers).length;
  const hasTraits = traits.length > 0;

  const questionSections = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const q of QUESTIONS) {
      const sec = q.section || 'Questions';
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(q);
    }
    return [...map.entries()];
  }, []);

  const skipQuestion = useCallback((qid: string) => {
    setAnswers((prev) => {
      const nextSet = { ...prev };
      delete nextSet[qid];
      return nextSet;
    });
    setSkipped((prev) => {
      const nextSet = new Set(prev);
      nextSet.add(qid);
      return nextSet;
    });
  }, []);

  const answerQuestion = useCallback((qid: string, label: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: label }));
    setSkipped((prev) => {
      if (!prev.has(qid)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(qid);
      return nextSet;
    });
  }, []);

  return (
    <SectionCard
      title="Product recommendations"
      description="Answer a few questions — or pick traits directly — then get the top 5 with a sales plan."
    >
      <div className={spacing}>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {!loaded ? (
          <div className="py-3 text-sm text-gray-500">Loading…</div>
        ) : mode === 'questions' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Quick questionnaire{' '}
                <span className="font-medium text-gray-800">
                  {answeredCount}/{QUESTIONS.length}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setMode('picker')}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Skip — pick traits directly →
              </button>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${Math.round((answeredCount / QUESTIONS.length) * 100)}%` }}
              />
            </div>
            <div className="max-h-80 space-y-4 overflow-y-auto rounded-md border border-gray-200 p-3">
              {questionSections.map(([section, qs]) => (
                <div key={section}>
                  <p className="mb-1.5 border-b border-gray-100 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {section}
                  </p>
                  <div className="space-y-3">
                    {qs.map((q) => {
                      const answered = answers[q.id] !== undefined;
                      const isSkipped = skipped.has(q.id);
                      return (
                        <div
                          key={q.id}
                          className={`rounded-md p-2.5 ${
                            isSkipped ? 'bg-gray-50 opacity-60' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-800">
                              {q.question}
                              {answered && (
                                <span className="ml-1.5 text-[10px] font-semibold text-green-600">
                                  ✓
                                </span>
                              )}
                              {isSkipped && (
                                <span className="ml-1.5 text-[10px] font-semibold text-gray-400">
                                  skipped
                                </span>
                              )}
                            </p>
                            <button
                              type="button"
                              onClick={() => skipQuestion(q.id)}
                              disabled={isSkipped}
                              className="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:border-gray-400 disabled:cursor-default disabled:opacity-40"
                            >
                              Skip
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {q.options.map((opt) => {
                              const active = answers[q.id] === opt.label;
                              return (
                                <button
                                  key={opt.label}
                                  type="button"
                                  onClick={() => answerQuestion(q.id, opt.label)}
                                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                    active
                                      ? 'border-blue-600 bg-blue-600 text-white'
                                      : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                {answeredCount} answered · {skipped.size} skipped ·{' '}
                {QUESTIONS.length - answeredCount - skipped.size} remaining
              </p>
              <button
                type="button"
                onClick={applyAnswers}
                disabled={(answeredCount === 0 && skipped.size === 0) || saving}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Applying…' : answeredCount > 0 ? `Apply answers → pick traits` : 'Continue without answers'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {traits.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTrait(t)}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800"
                >
                  {traitLabel(t)} ×
                </button>
              ))}
              {traits.length === 0 && (
                <span className="text-xs text-gray-400">No traits picked yet.</span>
              )}
              {saving && <span className="text-xs text-gray-400">saving…</span>}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('questions')}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
              >
                ← Back to questions
              </button>
              {traits.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    setTraits([]);
                    await saveTraits([]);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 hover:border-red-300 hover:text-red-600"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
              {GROUP_ORDER.filter((g) => VOCAB.groups[g]).map((group) => {
                const items = VOCAB.groups[group];
                const pickedInGroup = items.filter((i) => traits.includes(i.trait)).length;
                const isCollapsed = collapsedGroups.has(group);
                return (
                  <div key={group} className="rounded-md">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-gray-50 active:bg-gray-100"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        {group}
                        {pickedInGroup > 0 && (
                          <span className="ml-2 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-blue-600 px-1 py-0.5 text-[9px] font-bold text-white">
                            {pickedInGroup}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {isCollapsed ? '▸' : '▾'}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                        {items.map(({ trait, label }) => (
                          <button
                            key={trait}
                            type="button"
                            disabled={!knownTraits.has(trait)}
                            onClick={() => toggleTrait(trait)}
                            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                              traits.includes(trait)
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : knownTraits.has(trait)
                                  ? 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600'
                                  : 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={runRecommendations}
              disabled={!hasTraits || loadingRecs}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingRecs ? 'Scoring…' : hasTraits ? 'Get top 5 recommendations' : 'Pick traits first'}
            </button>

            {recs.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-gray-500">
                  One product per category — tap a category to compare alternatives with suitability stars.
                </div>
                {recs.map((r, i) => {
                  const inShortlist = shortlist.includes(r.product);
                  return (
                  <div
                    key={r.product}
                    className="rounded-md border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {i + 1}. {r.product}
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.category} · {r.price_tier} tier · score {r.score}{' '}
                          {typeof r.stars === 'number' && (
                            <span className="text-amber-500">
                              {'★'.repeat(r.stars)}
                              {'☆'.repeat(5 - r.stars)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setCompareCat(compareCat === r.category ? null : r.category)}
                          className="mt-1 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600"
                        >
                          {compareCat === r.category ? 'Hide comparison' : 'Compare alternatives in category'}
                        </button>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => addToShortlist(r.product)}
                          disabled={inShortlist}
                          className={`rounded border px-2 py-1 text-xs font-medium ${
                            inShortlist
                              ? 'cursor-default border-green-300 bg-green-50 text-green-700'
                              : 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50 active:bg-blue-100'
                          }`}
                        >
                          {inShortlist ? '✓ Shortlisted' : '+ Add to shortlist'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === i ? null : i)}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
                        >
                          {expanded === i ? 'Hide' : 'Plan + script'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Fit:</span>{' '}
                      {r.fit}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">Features:</span>{' '}
                      {r.features.join('; ')}
                    </div>

                    {compareCat === r.category && (
                      <ComparisonPanel
                        category={r.category}
                        comparisons={comparisons}
                        shortlist={shortlist}
                        onAdd={addToShortlist}
                      />
                    )}

                    {expanded === i && r.sales_plan && (
                      <div className="mt-2 space-y-1.5 rounded-md border border-blue-100 bg-blue-50/60 p-2.5 text-xs">
                        <div>
                          <span className="font-semibold text-blue-800">Why:</span>{' '}
                          <span className="text-blue-900">
                            {r.sales_plan.why_this_client}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-blue-800">Sell:</span>{' '}
                          <span className="text-blue-900">
                            {r.sales_plan.sell_points.join('; ')}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-blue-800">Script:</span>{' '}
                          <span className="italic text-blue-900">
                            {r.sales_plan.script}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-blue-800">Next:</span>{' '}
                          <span className="text-blue-900">
                            {r.sales_plan.next_step}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}


/** Inline category comparison: alternatives + differences + suitability stars. */
function ComparisonPanel({
  category,
  comparisons,
  shortlist,
  onAdd,
}: {
  category: string;
  comparisons: Record<string, ComparisonBundle>;
  shortlist: string[];
  onAdd: (name: string) => void;
}) {
  const bundle = comparisons[category];
  const rows = bundle?.rows;

  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-blue-100 bg-blue-50/50 p-2">
      <p className="mb-1.5 text-[11px] font-semibold text-blue-800">
        Compare — {category}
      </p>
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="text-gray-500">
            <th className="pb-1 pr-2 font-medium">Product</th>
            <th className="pb-1 pr-2 font-medium">Fit</th>
            <th className="pb-1 pr-2 font-medium">Tier</th>
            <th className="pb-1 pr-2 font-medium">Key differences</th>
            <th className="pb-1 font-medium">Shortlist</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const inList = shortlist.includes(row.product);
            return (
              <tr key={row.product} className="align-top">
                <td className="py-1 pr-2">
                  <span className="font-semibold text-gray-900">{row.product}</span>
                  <span className="ml-1 text-amber-500">
                    {'★'.repeat(row.stars)}
                    {'☆'.repeat(5 - row.stars)}
                  </span>
                </td>
                <td className="py-1 pr-2 text-gray-600">{row.matched_traits.length} traits</td>
                <td className="py-1 pr-2 text-gray-600">{row.price_tier}</td>
                <td className="py-1 pr-2 text-gray-600">{row.features.slice(0, 2).join('; ')}</td>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => onAdd(row.product)}
                    disabled={inList}
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                      inList
                        ? 'cursor-default border-green-300 bg-green-50 text-green-700'
                        : 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50 active:bg-blue-100'
                    }`}
                  >
                    {inList ? '✓ Added' : '+ Add'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type ComparisonBundle = {
  category: string;
  rows: Array<{
    product: string;
    score: number;
    stars: number;
    price_tier: string;
    features: string[];
    matched_traits: string[];
    gap?: string;
  }>;
};
