"use server";

import type { ContenderPage, SearchPlan, WatchProviders } from "@/lib/types";
import { fetchContenders, getWatchProviders } from "@/lib/tmdb";

// METERED — these hit TMDB. Only ever invoked from explicit clicks ("More
// contenders", "Where to watch"), never from an effect or on a loop.

/** Next page of contenders for an already-resolved plan. No new Gemini call. */
export async function loadMorePage(
  plan: SearchPlan,
  page: number,
): Promise<ContenderPage> {
  return fetchContenders(plan, page);
}

/** US watch providers for the crowned champion. null when none in the US. */
export async function fetchWatchProviders(
  movieId: number,
): Promise<WatchProviders | null> {
  return getWatchProviders(movieId);
}
