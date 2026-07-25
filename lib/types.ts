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
};

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
