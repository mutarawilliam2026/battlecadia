"use server";

import { searchContenders, ContenderSearchError } from "@/lib/channel3";
import type { Contender } from "@/lib/types";

export type LoadMoreResult =
  | { ok: true; contenders: Contender[]; nextPageToken: string | null }
  | { ok: false; message: string };

/**
 * Fetch the next page of contenders for a battle that has exhausted its
 * reserve.
 *
 * METERED — one credit per call. Only ever invoked from an explicit click on
 * "More contenders", never from an effect, and never retried automatically.
 *
 * Returns a result object rather than throwing: a thrown server action surfaces
 * as an opaque digest in production, and the button needs a readable message.
 */
export async function loadMoreContenders(
  query: string,
  pageToken: string | null,
): Promise<LoadMoreResult> {
  if (!query.trim()) return { ok: false, message: "Nothing to search for." };
  if (!pageToken) return { ok: true, contenders: [], nextPageToken: null };

  try {
    const page = await searchContenders(query, pageToken);
    return {
      ok: true,
      contenders: page.contenders,
      nextPageToken: page.nextPageToken,
    };
  } catch (err) {
    console.error("[loadMoreContenders]", err);
    const kind = err instanceof ContenderSearchError ? err.kind : "upstream";
    const message = {
      out_of_credits:
        "Out of Channel3 credits — can't load more contenders right now.",
      auth: "Channel3 rejected the API key.",
      bad_request: "Channel3 rejected that request.",
      upstream: "Couldn't reach Channel3. Try again shortly.",
    }[kind];
    return { ok: false, message };
  }
}
