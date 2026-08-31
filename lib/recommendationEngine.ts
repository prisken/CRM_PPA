/**
 * Product recommendation engine — TypeScript port of funds/recommend_engine.py.
 *
 * Client traits → scored product recommendations (top N) with per-product
 * fit rationale, key features (brochure-sourced), price tier, sales plan +
 * opening script. Data lives in src/data/*.json (synced from the funds
 * workspace research pipeline).
 *
 * Scoring: exact signal hit = 2.0, persona affinity = 1.0, price-tier
 * sensitivity ±1.5/±1.0. Same weights as the Python original.
 */

import personasData from './data/personas.json';
import productsData from './data/product-personas.json';

export interface Persona {
  id: string;
  name: string;
  zh_name: string;
  age: string;
  segment: string;
  needs: string[];
  budget: string;
  signals: Record<string, unknown>;
}

export interface ProductEntry {
  name: string;
  category: string;
  features: string[];
  audience: string;
  personas: string[];
  signals: string[];
  price_tier?: string;
  product_fit?: {
    gap?: string;
    best_for?: string;
    key_features?: string[];
    price_position?: string;
  };
}

export interface Recommendation {
  product: string;
  category: string;
  price_tier: string;
  score: number;
  matched_traits: string[];
  persona_overlap: string[];
  features: string[];
  audience: string;
  signals: string[];
  fit: string;
  product_fit?: ProductEntry['product_fit'];
}

export interface SalesPlan {
  product: string;
  category: string;
  why_this_client: string;
  sell_points: string[];
  hook: string;
  script: string;
  next_step: string;
}

export const PERSONAS = personasData.personas as Persona[];
export const PRODUCTS = productsData as ProductEntry[];

const HOOKS: Record<string, string> = {
  '危疾保障 (Critical Illness)':
    'Protecting your health means protecting the people who depend on you',
  '醫療保障 (Medical)':
    'Medical costs are the one bill nobody plans for — but everyone eventually faces',
  自願醫保: "You're paying tax anyway — why not turn some of it into private hospital cover?",
  '嚴重程度健康保障 (Severity-based Health)':
    'What if a single plan paid out based on how sick you actually are?',
  '意外及其他保障 (Accident & Other)':
    'Life changes in a second — a good accident plan costs less than a taxi ride',
  '人壽保障 (Life)':
    "The people you love should never have to worry about money when you're gone",
  '儲蓄保險 (Savings)':
    'Your future self will thank you for the discipline you start today',
  '投資成分保險 (Investment Focus)':
    'Your money should work as hard as you do — across currencies and decades',
  '退休收入 (Retirement Income)':
    'The best retirement is the one you started funding years ago',
  '投資相連壽險 (ILAS)':
    'Invest with the discipline of insurance and the growth of the market',
  '消閒保險 (Leisure)':
    'Do what you love — with a safety net for the unexpected',
};

const GAP_BY_CAT: Record<string, string> = {
  '危疾保障 (Critical Illness)':
    'Covers the financial shock of critical illness — lump sum when you need it most',
  '醫療保障 (Medical)':
    'Covers hospital & treatment costs — the everyday healthcare bill',
  自願醫保: 'Tax-deductible private hospital cover under the government VHIS scheme',
  '嚴重程度健康保障 (Severity-based Health)':
    'Pays out by severity of illness — fair payouts for every stage',
  '意外及其他保障 (Accident & Other)':
    'Covers accidents — the most unpredictable, least expensive risk',
  '人壽保障 (Life)':
    "Protects your family's income if you're gone — the foundation of financial planning",
  '儲蓄保險 (Savings)':
    'Disciplined savings with guaranteed returns — build wealth steadily',
  '投資成分保險 (Investment Focus)':
    'Grow wealth across currencies with insurance discipline',
  '退休收入 (Retirement Income)':
    'Converts savings into guaranteed retirement income',
  '投資相連壽險 (ILAS)':
    'Investment exposure with life cover — for the market-savvy',
  '消閒保險 (Leisure)':
    'Protection for your hobbies — do what you love with a safety net',
};

function buildVocabulary(): Map<string, Set<string>> {
  const vocab = new Map<string, Set<string>>();
  for (const p of PERSONAS) {
    for (const sig of Object.keys(p.signals || {})) {
      if (!vocab.has(sig)) vocab.set(sig, new Set());
      vocab.get(sig)!.add(p.id);
    }
  }
  for (const prod of PRODUCTS) {
    for (const sig of prod.signals || []) {
      if (!vocab.has(sig)) vocab.set(sig, new Set());
    }
  }
  return vocab;
}

export const VOCABULARY = buildVocabulary();

export function normalizeTrait(t: string): string {
  return t.trim().toLowerCase();
}

export function fitStatement(
  prod: ProductEntry,
  hits: string[],
  personaHits: string[]
): string {
  const parts: string[] = [];
  if (hits.length) {
    parts.push(`matched ${hits.length} client signal(s): ${hits.join(', ')}`);
  }
  if (personaHits.length) {
    parts.push(`fits persona type(s): ${personaHits.join(', ')}`);
  }
  if (prod.audience) {
    parts.push(`designed for: ${prod.audience}`);
  }
  return parts.length ? parts.join('; ') : 'general fit';
}

export function scoreClient(traits: string[], topN = 5): Recommendation[] {
  const norm = traits.map(normalizeTrait).filter(Boolean);
  const scored: Recommendation[] = [];

  for (const prod of PRODUCTS) {
    // skip cross-listing placeholder entries
    const featStr = (prod.features || []).join(' ');
    if (/Cross-listed|See CI listing|See Life|see CI category/i.test(featStr)) {
      continue;
    }

    const prodSigs = new Set<string>();
    for (const sig of prod.signals || []) {
      prodSigs.add(sig.toLowerCase());
      prodSigs.add(sig.toLowerCase().split(':')[0].trim());
    }
    const prodPers = new Set(prod.personas || []);

    const hits: string[] = [];
    const personaHits = new Set<string>();
    for (const t of norm) {
      if (prodSigs.has(t)) hits.push(t);
      const vp = VOCABULARY.get(t);
      if (vp) {
        for (const pid of vp) {
          if (prodPers.has(pid)) personaHits.add(pid);
        }
      }
    }

    let score = hits.length * 2.0 + personaHits.size * 1.0;
    const tier = prod.price_tier || 'mid';
    if (norm.includes('budget_low') || norm.includes('budget_mid')) {
      score += tier === 'budget' ? 1.5 : tier === 'premium' ? -1.5 : 0;
    }
    if (
      norm.includes('income_high') ||
      norm.includes('income_very_high') ||
      norm.includes('net_worth_high')
    ) {
      score += tier === 'premium' ? 1.5 : tier === 'budget' ? -1.0 : 0;
    }

    if (score > 0) {
      scored.push({
        product: prod.name,
        category: prod.category,
        price_tier: tier,
        score: Math.round(score * 10) / 10,
        matched_traits: [...hits].sort(),
        persona_overlap: [...personaHits].sort(),
        features: prod.features || [],
        audience: prod.audience || '',
        signals: prod.signals || [],
        fit: fitStatement(prod, [...hits], [...personaHits]),
        product_fit: prod.product_fit || {
          gap: GAP_BY_CAT[prod.category] || 'Fills a protection need',
          best_for: prod.audience || '',
          key_features: prod.features || [],
          price_position: tier,
        },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

export function salesPlan(rec: Recommendation, clientName: string): SalesPlan {
  const feat = rec.features.slice(0, 3);
  const hook = HOOKS[rec.category] || "Here's a plan worth a conversation";
  const matched = rec.matched_traits.length
    ? rec.matched_traits.join(', ')
    : 'profile fit';
  const featureLine = feat.map((f) => f.toLowerCase()).join(', ');
  return {
    product: rec.product,
    category: rec.category,
    why_this_client: `Matched on: ${matched} — this product fits the client profile.`,
    sell_points: feat,
    hook,
    script: `"${clientName}, ${hook.toLowerCase()}. Based on what you've shared, I think ${rec.product} deserves a look — ${featureLine}. Can I walk you through how it would work for your situation?"`,
    next_step:
      'Book the needs-analysis meeting; bring the brochure + a personalised illustration.',
  };
}

// ---------- REVERSE MATCHING: product → matching clients ----------

export function productSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function listProducts(): Array<{
  slug: string;
  name: string;
  category: string;
  price_tier: string;
  features: string[];
  gap?: string;
}> {
  return PRODUCTS.filter(
    (p) => !/Cross-listed|See CI listing|See Life|see CI category/i.test(
      (p.features || []).join(' ')
    )
  ).map((p) => ({
    slug: productSlug(p.name),
    name: p.name,
    category: p.category,
    price_tier: p.price_tier || 'mid',
    features: (p.features || []).slice(0, 3),
    gap: p.product_fit?.gap,
  }));
}

export function findProductBySlug(slug: string): ProductEntry | undefined {
  return PRODUCTS.find((p) => productSlug(p.name) === slug);
}

export interface ClientLite {
  id: string;
  name: string;
  company?: string | null;
  traits: string[];
}

export interface ClientMatch {
  client_id: string;
  client_name: string;
  company: string | null;
  score: number;
  matched_traits: string[];
  persona_overlap: string[];
  trait_count: number;
}

/**
 * Reverse target: score a set of clients against ONE product.
 * Score = matched signal hits ×2.0 + persona affinity ×1.0 + price-tier
 * sensitivity (mirror of scoreClient, direction inverted).
 */
export function matchClientsForProduct(
  productName: string,
  clients: ClientLite[]
): ClientMatch[] {
  const prod = PRODUCTS.find((p) => p.name === productName);
  if (!prod) return [];

  const prodSigs = new Set<string>();
  for (const sig of prod.signals || []) {
    prodSigs.add(sig.toLowerCase());
    prodSigs.add(sig.toLowerCase().split(':')[0].trim());
  }
  const prodPers = new Set(prod.personas || []);
  const tier = prod.price_tier || 'mid';

  const out: ClientMatch[] = [];
  for (const c of clients) {
    if (!c.traits.length) continue;
    const norm = c.traits.map(normalizeTrait).filter(Boolean);
    const hits: string[] = [];
    const personaHits = new Set<string>();
    for (const t of norm) {
      if (prodSigs.has(t)) hits.push(t);
      const vp = VOCABULARY.get(t);
      if (vp) {
        for (const pid of vp) {
          if (prodPers.has(pid)) personaHits.add(pid);
        }
      }
    }
    let score = hits.length * 2.0 + personaHits.size * 1.0;
    if (norm.includes('budget_low') || norm.includes('budget_mid')) {
      score += tier === 'budget' ? 1.5 : tier === 'premium' ? -1.5 : 0;
    }
    if (
      norm.includes('income_high') ||
      norm.includes('income_very_high') ||
      norm.includes('net_worth_high')
    ) {
      score += tier === 'premium' ? 1.5 : tier === 'budget' ? -1.0 : 0;
    }
    if (score > 0) {
      out.push({
        client_id: c.id,
        client_name: c.name,
        company: c.company ?? null,
        score: Math.round(score * 10) / 10,
        matched_traits: [...hits].sort(),
        persona_overlap: [...personaHits].sort(),
        trait_count: norm.length,
      });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
