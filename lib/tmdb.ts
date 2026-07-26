import type {
  Contender,
  ContenderPage,
  EnrichedFilm,
  MovieQuery,
  Refinements,
  SearchPlan,
  WatchProvider,
  WatchProviders,
} from "./types";
import { parseMovieQuery } from "./gemini";

// ---------------------------------------------------------------------------
// The single TMDB boundary. Callers get back OUR types (Contender, ContenderPage,
// WatchProviders) — never TMDB's own response shape. Swap the data source later
// by rewriting this file alone.
//
// Auth: an API Read Access Token sent as `Authorization: Bearer` on every call
// (not the api_key query param). Server-side only.
// Endpoints and parameter names verified against developer.themoviedb.org.
// ---------------------------------------------------------------------------

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

// Without a vote-count floor /discover returns obscure films with a handful of
// ratings and the bracket is unplayable. It's a constant, not a judgment — so
// it lives here, on every discover call, and is NOT part of MovieQuery.
const MIN_VOTE_COUNT = 100;

function accessToken(): string {
  const t = process.env.TMDB_ACCESS_TOKEN;
  if (!t) {
    throw new Error("TMDB_ACCESS_TOKEN is not set (see .env.local.example).");
  }
  return t;
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken()}`, Accept: "application/json" },
    // Product data must never be cached beyond the in-memory round buffer.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

// --- Minimal structural views of the responses. Only fields we use appear. ---
type TmdbMovie = {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  original_language?: string;
};
type TmdbPage = { page: number; results?: TmdbMovie[]; total_pages: number };
type TmdbProvider = {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
};
type TmdbCountryProviders = {
  link?: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
};
type TmdbWatchResponse = { results?: Record<string, TmdbCountryProviders> };

/** Map one TMDB movie to a Contender, or null if it can't be a card. */
function toContender(m: TmdbMovie): Contender | null {
  // A card with no image is dead weight and TMDB has plenty of alternatives.
  if (!m.poster_path || !m.title) return null;
  return {
    id: m.id,
    title: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    posterUrl: `${IMG}/w500${m.poster_path}`,
    overview: m.overview ?? "",
    rating: m.vote_average ?? 0,
    voteCount: m.vote_count ?? 0,
    genreIds: m.genre_ids ?? [],
    language: m.original_language ?? "",
  };
}

function mapPage(p: TmdbPage): ContenderPage {
  return {
    contenders: (p.results ?? [])
      .map(toContender)
      .filter((c): c is Contender => c !== null),
    page: p.page,
    totalPages: p.total_pages,
  };
}

// Genre list is static; cache it for the process so we don't refetch per parse.
let genreCache: { id: number; name: string }[] | null = null;

export async function getGenres(): Promise<{ id: number; name: string }[]> {
  if (genreCache) return genreCache;
  const data = await tmdbGet<{ genres?: { id: number; name: string }[] }>(
    "/genre/movie/list",
    { language: "en-US" },
  );
  genreCache = data.genres ?? [];
  return genreCache;
}

export async function discoverMovies(
  q: MovieQuery,
  r: Refinements,
  page: number,
): Promise<ContenderPage> {
  const params: Record<string, string> = {
    include_adult: "false",
    language: "en-US",
    sort_by: q.sortBy || "popularity.desc",
    "vote_count.gte": String(MIN_VOTE_COUNT),
    page: String(page),
  };

  // A refined genre narrows to that single genre; otherwise the plan's genres.
  const genre = r.genreId != null ? [r.genreId] : q.genreIds;
  if (genre.length) params.with_genres = genre.join(",");

  // A refined decade overrides the plan's date window entirely.
  if (r.decade != null) {
    params["primary_release_date.gte"] = `${r.decade}-01-01`;
    params["primary_release_date.lte"] = `${r.decade + 9}-12-31`;
  } else {
    if (q.yearFrom != null) params["primary_release_date.gte"] = `${q.yearFrom}-01-01`;
    if (q.yearTo != null) params["primary_release_date.lte"] = `${q.yearTo}-12-31`;
  }

  // Rating stacks: take the stricter of the plan's floor and the refinement.
  const rating = Math.max(q.minRating ?? 0, r.minRating ?? 0);
  if (rating > 0) params["vote_average.gte"] = String(rating);

  if (r.maxRuntime != null) params["with_runtime.lte"] = String(r.maxRuntime);
  if (r.language != null) params.with_original_language = r.language;
  if (r.keywordId != null) params.with_keywords = String(r.keywordId);
  if (r.providerId != null) {
    params.with_watch_providers = String(r.providerId);
    params.watch_region = "US";
  }

  return mapPage(await tmdbGet<TmdbPage>("/discover/movie", params));
}

/** Top title-search hit's id, or null when nothing matches. */
export async function searchMovieId(title: string): Promise<number | null> {
  const data = await tmdbGet<TmdbPage>("/search/movie", {
    query: title,
    include_adult: "false",
    language: "en-US",
    page: "1",
  });
  return data.results?.[0]?.id ?? null;
}

export async function recommendations(
  movieId: number,
  page: number,
): Promise<ContenderPage> {
  return mapPage(
    await tmdbGet<TmdbPage>(`/movie/${movieId}/recommendations`, {
      language: "en-US",
      page: String(page),
    }),
  );
}

// Memoize the resolved plan per prompt for the process lifetime. This is what
// lets refinements ride in the URL without ever re-running Gemini: changing a
// filter re-renders the page with the SAME q, which hits this cache instead of
// the model. Only the Gemini/search resolution is memoized — never the results.
const planCache = new Map<string, { plan: SearchPlan; query: MovieQuery }>();

/**
 * Turn a plain-English prompt into a pageable SearchPlan. The "like" branch
 * lives here, in code, not in the prompt: when Gemini names a specific film we
 * resolve it via /search/movie and switch to that film's recommendations.
 */
export async function resolveSearch(
  prompt: string,
): Promise<{ plan: SearchPlan; query: MovieQuery }> {
  const cached = planCache.get(prompt);
  if (cached) return cached;

  const genres = await getGenres();
  const query = await parseMovieQuery(prompt, genres);

  let resolved: { plan: SearchPlan; query: MovieQuery };
  if (query.titleSearch) {
    const movieId = await searchMovieId(query.titleSearch);
    resolved =
      movieId !== null
        ? { plan: { kind: "recommendations", movieId }, query }
        : { plan: { kind: "discover", query }, query };
  } else {
    resolved = { plan: { kind: "discover", query }, query };
  }

  planCache.set(prompt, resolved);
  return resolved;
}

// --- Pool + enrichment ------------------------------------------------------
// The battle needs only the top 10, but the Refine panel profiles a larger
// pool. We fetch a couple of pages, then enrich each film with the fields
// search results don't carry (runtime, keywords, US streaming providers) via
// one /movie/{id} call apiece, in parallel.

const POOL_PAGES = 2; // ~40 films to profile against
const MAX_REC_PAGES = 3;

export type EnrichedPool = {
  films: EnrichedFilm[];
  /** Last page fetched (discover) — where "More contenders" resumes. */
  page: number;
  totalPages: number;
};

/** True when an enriched film satisfies every active refinement. */
function passesRefinements(f: EnrichedFilm, r: Refinements): boolean {
  if (r.genreId != null && !f.genreIds.includes(r.genreId)) return false;
  if (r.minRating != null && f.rating < r.minRating) return false;
  if (r.maxRuntime != null && (f.runtime == null || f.runtime > r.maxRuntime))
    return false;
  if (r.language != null && f.language !== r.language) return false;
  if (r.keywordId != null && !f.keywords.some((k) => k.id === r.keywordId))
    return false;
  if (r.providerId != null && !f.providers.some((p) => p.id === r.providerId))
    return false;
  if (r.decade != null) {
    const y = f.year ? Number(f.year) : null;
    if (y === null || y < r.decade || y > r.decade + 9) return false;
  }
  return true;
}

type TmdbDetail = TmdbMovie & {
  runtime?: number | null;
  keywords?: { keywords?: { id: number; name: string }[] };
  "watch/providers"?: { results?: Record<string, TmdbCountryProviders> };
};

async function enrichFilm(c: Contender): Promise<EnrichedFilm> {
  try {
    const d = await tmdbGet<TmdbDetail>(`/movie/${c.id}`, {
      language: "en-US",
      append_to_response: "keywords,watch/providers",
    });
    const us = d["watch/providers"]?.results?.US;
    return {
      ...c,
      runtime: d.runtime ?? null,
      keywords: (d.keywords?.keywords ?? []).map((k) => ({
        id: k.id,
        name: k.name,
      })),
      providers: (us?.flatrate ?? []).map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
      })),
    };
  } catch {
    // A failed enrichment shouldn't sink the pool — that film just can't
    // contribute to the runtime/keyword/provider facets.
    return { ...c, runtime: null, keywords: [], providers: [] };
  }
}

/** Enrich a pool in parallel — one /movie/{id} call per film. */
export function enrichPool(contenders: Contender[]): Promise<EnrichedFilm[]> {
  return Promise.all(contenders.map(enrichFilm));
}

async function gatherRecommendations(movieId: number): Promise<Contender[]> {
  const seen = new Set<number>();
  const pool: Contender[] = [];
  let totalPages = 1;
  for (let page = 1; page <= Math.min(totalPages, MAX_REC_PAGES); page++) {
    const res = await recommendations(movieId, page);
    totalPages = res.totalPages;
    for (const c of res.contenders) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        pool.push(c);
      }
    }
  }
  return pool;
}

/**
 * Build and enrich the pool the Refine panel profiles against. Discover applies
 * refinements as query params; recommendations can't, so we filter the enriched
 * set in code. Either way the result is the already-narrowed pool.
 */
export async function buildEnrichedPool(
  plan: SearchPlan,
  r: Refinements,
): Promise<EnrichedPool> {
  if (plan.kind === "recommendations") {
    const enriched = await enrichPool(await gatherRecommendations(plan.movieId));
    return {
      films: enriched.filter((f) => passesRefinements(f, r)),
      page: 1,
      totalPages: 1,
    };
  }

  const seen = new Set<number>();
  const contenders: Contender[] = [];
  let page = 0;
  let totalPages = 1;
  for (let p = 1; p <= Math.min(totalPages, POOL_PAGES); p++) {
    const res = await discoverMovies(plan.query, r, p);
    page = res.page;
    totalPages = res.totalPages;
    for (const c of res.contenders) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        contenders.push(c);
      }
    }
  }
  return { films: await enrichPool(contenders), page, totalPages };
}

/** One more page for "More contenders". Recommendations are a single pool. */
export function fetchContenders(
  plan: SearchPlan,
  r: Refinements,
  page: number,
): Promise<ContenderPage> {
  if (plan.kind === "recommendations") {
    return Promise.resolve({ contenders: [], page: 1, totalPages: 1 });
  }
  return discoverMovies(plan.query, r, page);
}

/** US watch providers, normalized. null when TMDB has no US entry at all. */
export async function getWatchProviders(
  movieId: number,
): Promise<WatchProviders | null> {
  const data = await tmdbGet<TmdbWatchResponse>(
    `/movie/${movieId}/watch/providers`,
  );
  const us = data.results?.US;
  if (!us || !us.link) return null;

  const map = (arr: TmdbProvider[] | undefined): WatchProvider[] =>
    (arr ?? []).map((p) => ({
      providerId: p.provider_id,
      providerName: p.provider_name,
      logoUrl: p.logo_path ? `${IMG}/w92${p.logo_path}` : null,
    }));

  return {
    link: us.link,
    streaming: map(us.flatrate),
    rent: map(us.rent),
    buy: map(us.buy),
  };
}
