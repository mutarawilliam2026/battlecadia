import type { RefinementKey, Refinements } from "./types";

// ---------------------------------------------------------------------------
// Pure helpers for reading refinements out of the URL and writing them back.
// Shared by the server (parses searchParams) and the client (builds hrefs), so
// this file stays free of any server-only imports.
// ---------------------------------------------------------------------------

export const NO_REFINEMENTS: Refinements = {
  genreId: null,
  decade: null,
  minRating: null,
  maxRuntime: null,
  language: null,
  keywordId: null,
};

// Each refinement's URL parameter name. The one string ↔ number/string mapping.
const PARAM: Record<RefinementKey, string> = {
  genreId: "genre",
  decade: "decade",
  minRating: "rating",
  maxRuntime: "runtime",
  language: "lang",
  keywordId: "keyword",
};

type SearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : null;
}
function num(v: string | string[] | undefined): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseRefinements(sp: SearchParams): Refinements {
  return {
    genreId: num(sp[PARAM.genreId]),
    decade: num(sp[PARAM.decade]),
    minRating: num(sp[PARAM.minRating]),
    maxRuntime: num(sp[PARAM.maxRuntime]),
    language: str(sp[PARAM.language]),
    keywordId: num(sp[PARAM.keywordId]),
  };
}

/** Build a /battle URL for a query plus a set of refinements. */
export function buildBattleUrl(query: string, r: Refinements): string {
  const p = new URLSearchParams({ q: query });
  (Object.keys(PARAM) as RefinementKey[]).forEach((key) => {
    const v = r[key];
    if (v != null && v !== "") p.set(PARAM[key], String(v));
  });
  return `/battle?${p.toString()}`;
}

/** Return a copy of `r` with `key` set to `raw` (coerced to the right type). */
export function withRefinement(
  r: Refinements,
  key: RefinementKey,
  raw: string,
): Refinements {
  const value = key === "language" ? raw : Number(raw);
  return { ...r, [key]: value };
}

/** Return a copy of `r` with `key` cleared. */
export function withoutRefinement(r: Refinements, key: RefinementKey): Refinements {
  return { ...r, [key]: null };
}

/** Stable signature — changes whenever any refinement changes. */
export function refineKey(r: Refinements): string {
  return (Object.keys(PARAM) as RefinementKey[]).map((k) => r[k]).join("|");
}

export function hasAnyRefinement(r: Refinements): boolean {
  return Object.values(r).some((v) => v != null);
}
