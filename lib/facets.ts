import type {
  AppliedChip,
  EnrichedFilm,
  Facet,
  FacetValue,
  Refinements,
  RefinementKey,
} from "./types";

// ---------------------------------------------------------------------------
// Facet engine. Every dimension and every value is DERIVED from the current
// enriched pool — nothing is a fixed list. An axis is offered only when it
// genuinely splits the pool; the surviving axes are ranked by how evenly they
// split and the top four are shown. Pure functions, no I/O.
// ---------------------------------------------------------------------------

const MIN_COVER = 4; // a value must cover ≥ this many films to be offerable
const MAX_SHARE = 0.8; // drop an axis covering > this fraction of the pool
const MIN_CONTINUOUS = 8; // need this many data points to threshold a continuous axis
const MIN_RATING_SPREAD = 0.5; // below this the ratings are all "the same"
const MIN_RUNTIME_SPREAD = 20; // minutes
const VALUE_CAP = 8; // most chips to show on any one axis

// The ONLY curated list in this file. These TMDB "keywords" are production
// metadata (credits-scene tags), NOT themes — a deliberate denylist to strip
// noise. It is NOT a curated allowlist of interesting keywords; every other
// keyword flows through untouched.
const STINGER_KEYWORDS = new Set([
  "aftercreditsstinger",
  "duringcreditsstinger",
  "mid-credits scene",
  "post-credits scene",
  "no credits scene",
]);

const langNames = new Intl.DisplayNames(["en"], { type: "language" });
function languageName(code: string): string {
  try {
    return langNames.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * Shannon entropy (nats) of a set of counts — higher means a richer, more even
 * split. Deliberately NOT normalized by the value count: a binary axis split
 * 50/50 tops out at ln(2) ≈ 0.69, while a multi-value axis (four decades, six
 * keywords) scores higher. Normalizing would make every median rating/runtime
 * threshold a perfect 1.0 and bury the discrete axes that make searches differ.
 */
function splitScore(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0 || counts.length < 2) return 0;
  return -counts.reduce((s, c) => {
    const p = c / total;
    return s + (p > 0 ? p * Math.log(p) : 0);
  }, 0);
}

function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

type Scored = { facet: Facet; score: number };

/** Build a discrete-axis facet from one (film → value) occurrence per entry. */
function discreteFacet(
  key: RefinementKey,
  label: string,
  entries: { value: string; label: string }[],
  poolSize: number,
): Scored | null {
  const counts = new Map<string, { label: string; count: number }>();
  for (const e of entries) {
    const cur = counts.get(e.value);
    if (cur) cur.count += 1;
    else counts.set(e.value, { label: e.label, count: 1 });
  }

  const all = [...counts.values()];
  if (all.length === 0) return null;
  const maxShare = Math.max(...all.map((v) => v.count)) / poolSize;
  const offerable = [...counts.entries()]
    .filter(([, v]) => v.count >= MIN_COVER)
    .map(([value, v]) => ({ label: v.label, count: v.count, value }));

  if (offerable.length < 2 || maxShare > MAX_SHARE) return null;

  offerable.sort((a, b) => b.count - a.count);
  return {
    facet: { key, label, values: offerable },
    score: splitScore(offerable.map((v) => v.count)),
  };
}

/** Build a continuous-axis facet (rating / runtime) from derived thresholds. */
function continuousFacet(
  key: "minRating" | "maxRuntime",
  label: string,
  xs: number[],
  direction: "gte" | "lte", // gte: keep films ≥ t; lte: keep films ≤ t
  minSpread: number,
  render: (t: number) => { threshold: number; label: string },
): Scored | null {
  if (xs.length < MIN_CONTINUOUS) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted[sorted.length - 1] - sorted[0] < minSpread) return null;

  const thresholds = [...new Set([percentile(sorted, 0.5), percentile(sorted, 0.75)])];
  const values: FacetValue[] = [];
  let best = 0;
  const seen = new Set<number>();

  for (const raw of thresholds) {
    const { threshold, label: valueLabel } = render(raw);
    if (seen.has(threshold)) continue;
    seen.add(threshold);

    const narrowed =
      direction === "gte"
        ? xs.filter((x) => x >= threshold).length
        : xs.filter((x) => x <= threshold).length;
    const other = xs.length - narrowed;

    // A real split: both sides substantial, neither dominant.
    if (
      narrowed < MIN_COVER ||
      other < MIN_COVER ||
      narrowed / xs.length > MAX_SHARE ||
      other / xs.length > MAX_SHARE
    ) {
      continue;
    }
    values.push({ label: valueLabel, count: narrowed, value: String(threshold) });
    best = Math.max(best, splitScore([narrowed, other]));
  }

  if (values.length === 0) return null;
  return { facet: { key, label, values }, score: best };
}

/**
 * Compute the refinable axes for a pool: only those that genuinely split it,
 * ranked by split richness, top four. `genres` maps ids to names. Streaming is
 * deliberately NOT a facet — a film's US providers change constantly and
 * carriers cluster the pool without narrowing intent; providers belong on the
 * champion's "where to watch" screen, where showing every one is the point.
 */
export function computeFacets(
  pool: EnrichedFilm[],
  genres: { id: number; name: string }[],
  limit = 4,
): Facet[] {
  const n = pool.length;
  if (n === 0) return [];
  const genreName = new Map(genres.map((g) => [g.id, g.name]));

  const candidates: (Scored | null)[] = [
    discreteFacet(
      "genreId",
      "Genre",
      pool.flatMap((f) =>
        f.genreIds
          .filter((id) => genreName.has(id))
          .map((id) => ({ value: String(id), label: genreName.get(id)! })),
      ),
      n,
    ),
    discreteFacet(
      "decade",
      "Decade",
      pool.flatMap((f) => {
        const y = f.year ? Number(f.year) : NaN;
        if (!Number.isFinite(y)) return [];
        const d = Math.floor(y / 10) * 10;
        return [{ value: String(d), label: `${d}s` }];
      }),
      n,
    ),
    discreteFacet(
      "language",
      "Language",
      pool
        .filter((f) => f.language)
        .map((f) => ({ value: f.language, label: languageName(f.language) })),
      n,
    ),
    discreteFacet(
      "keywordId",
      "Keyword",
      pool.flatMap((f) =>
        f.keywords
          .filter((k) => !STINGER_KEYWORDS.has(k.name.toLowerCase()))
          .map((k) => ({ value: String(k.id), label: k.name })),
      ),
      n,
    ),
    continuousFacet(
      "minRating",
      "Rating",
      pool.map((f) => f.rating),
      "gte",
      MIN_RATING_SPREAD,
      (t) => {
        const threshold = Math.round(t * 10) / 10;
        return { threshold, label: `${threshold.toFixed(1)}+` };
      },
    ),
    continuousFacet(
      "maxRuntime",
      "Runtime",
      pool.map((f) => f.runtime).filter((r): r is number => r != null),
      "lte",
      MIN_RUNTIME_SPREAD,
      (t) => {
        const threshold = Math.round(t);
        return { threshold, label: `Under ${threshold} min` };
      },
    ),
  ];

  return candidates
    .filter((c): c is Scored => c !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => ({ ...c.facet, values: c.facet.values.slice(0, VALUE_CAP) }));
}

/** Resolve each active refinement to a human label for its removable chip. */
export function computeApplied(
  r: Refinements,
  pool: EnrichedFilm[],
  genres: { id: number; name: string }[],
): AppliedChip[] {
  const genreName = new Map(genres.map((g) => [g.id, g.name]));
  const chips: AppliedChip[] = [];

  if (r.genreId != null)
    chips.push({ key: "genreId", label: genreName.get(r.genreId) ?? "Genre" });
  if (r.decade != null) chips.push({ key: "decade", label: `${r.decade}s` });
  if (r.minRating != null)
    chips.push({ key: "minRating", label: `${r.minRating.toFixed(1)}+` });
  if (r.maxRuntime != null)
    chips.push({ key: "maxRuntime", label: `Under ${r.maxRuntime} min` });
  if (r.language != null)
    chips.push({ key: "language", label: languageName(r.language) });
  if (r.keywordId != null) {
    const name = pool.flatMap((f) => f.keywords).find((k) => k.id === r.keywordId)?.name;
    chips.push({ key: "keywordId", label: name ?? "Keyword" });
  }
  return chips;
}
