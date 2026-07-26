// ---------------------------------------------------------------------------
// The shapes the app agrees on. TMDB's own response shape stops at lib/tmdb.ts;
// everything else — battle logic, pages, components — speaks only in these.
// ---------------------------------------------------------------------------

/** A film in the bracket. The ONLY movie shape the UI ever sees. */
export type Contender = {
  id: number;
  title: string;
  year: string | null;
  posterUrl: string | null;
  overview: string;
  rating: number; // vote_average
  voteCount: number;
  /** TMDB genre ids on this film. Free from search results. */
  genreIds: number[];
  /** ISO 639-1 original language, e.g. "en". Free from search results. */
  language: string;
};

/**
 * A pool film enriched with the per-film fields that search results don't carry
 * (one /movie/{id} call each). Used only to profile the pool for facets — the
 * battle itself needs only the Contender fields.
 */
export type EnrichedFilm = Contender & {
  runtime: number | null;
  keywords: { id: number; name: string }[];
  /** US flatrate (streaming) providers on this film. */
  providers: { id: number; name: string }[];
};

/**
 * Structured constraints layered on top of a resolved plan. One value per
 * dimension (they stack ACROSS dimensions). Carried in the URL beside q — they
 * narrow the search but NEVER trigger another Gemini call.
 */
export type Refinements = {
  genreId: number | null; // → with_genres
  decade: number | null; // start year → primary_release_date range
  minRating: number | null; // → vote_average.gte (a derived threshold)
  maxRuntime: number | null; // → with_runtime.lte (a derived threshold)
  language: string | null; // → with_original_language
  keywordId: number | null; // → with_keywords
  providerId: number | null; // → with_watch_providers (watch_region US)
};

export type RefinementKey = keyof Refinements;

/** One offerable value on a facet axis, with its real count in the pool. */
export type FacetValue = {
  label: string; // e.g. "Horror", "1980s", "found footage", "7.2+"
  count: number;
  value: string; // the raw value written to the URL
};

/** A refinable axis that genuinely splits the current pool. */
export type Facet = {
  key: RefinementKey;
  label: string; // axis name, e.g. "Genre"
  values: FacetValue[];
};

/** A currently-applied refinement, resolved to a human label for its chip. */
export type AppliedChip = { key: RefinementKey; label: string };

/**
 * Gemini's structured translation of a plain-English prompt into TMDB discover
 * filters. Schema-constrained — see lib/gemini.ts. `vote_count.gte` is
 * deliberately absent: it's a hardcoded constant in lib/tmdb.ts, not a choice.
 */
export type MovieQuery = {
  genreIds: number[];
  yearFrom: number | null;
  yearTo: number | null;
  minRating: number | null; // → vote_average.gte
  sortBy: string; // a valid TMDB sort_by value
  titleSearch: string | null; // set ONLY when a specific film is named
};

/**
 * How a resolved search pages. Built once on the server so "More contenders"
 * can fetch page N deterministically without paying for another Gemini call.
 */
export type SearchPlan =
  | { kind: "discover"; query: MovieQuery }
  | { kind: "recommendations"; movieId: number };

/** One page of contenders plus where it sits in TMDB's pagination. */
export type ContenderPage = {
  contenders: Contender[];
  page: number;
  totalPages: number;
};

/** One streaming / rent / buy option for the "Where to watch" screen. */
export type WatchProvider = {
  providerId: number;
  providerName: string;
  logoUrl: string | null;
};

/** The US watch-providers entry, normalized. null when TMDB has no US data. */
export type WatchProviders = {
  link: string;
  streaming: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
};
