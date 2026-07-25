import type {
  Contender,
  ContenderPage,
  MovieQuery,
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
  page: number,
): Promise<ContenderPage> {
  const params: Record<string, string> = {
    include_adult: "false",
    language: "en-US",
    sort_by: q.sortBy || "popularity.desc",
    "vote_count.gte": String(MIN_VOTE_COUNT),
    page: String(page),
  };
  if (q.genreIds.length) params.with_genres = q.genreIds.join(",");
  if (q.yearFrom != null) params["primary_release_date.gte"] = `${q.yearFrom}-01-01`;
  if (q.yearTo != null) params["primary_release_date.lte"] = `${q.yearTo}-12-31`;
  if (q.minRating != null) params["vote_average.gte"] = String(q.minRating);

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

/**
 * Turn a plain-English prompt into a pageable SearchPlan. The "like" branch
 * lives here, in code, not in the prompt: when Gemini names a specific film we
 * resolve it via /search/movie and switch to that film's recommendations.
 */
export async function resolveSearch(
  prompt: string,
): Promise<{ plan: SearchPlan; query: MovieQuery }> {
  const genres = await getGenres();
  const query = await parseMovieQuery(prompt, genres);

  if (query.titleSearch) {
    const movieId = await searchMovieId(query.titleSearch);
    if (movieId !== null) {
      return { plan: { kind: "recommendations", movieId }, query };
    }
  }
  return { plan: { kind: "discover", query }, query };
}

/** Fetch one page for a resolved plan — the single entry point paging uses. */
export function fetchContenders(
  plan: SearchPlan,
  page: number,
): Promise<ContenderPage> {
  return plan.kind === "recommendations"
    ? recommendations(plan.movieId, page)
    : discoverMovies(plan.query, page);
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
