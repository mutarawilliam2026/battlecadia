import "server-only";

import {
  Channel3,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  BadRequestError,
} from "@channel3/sdk";
import type { Contender } from "./types";

// ---------------------------------------------------------------------------
// The single Channel3 boundary. Pages call `searchContenders` and get back OUR
// Contender type — they never see a vendor shape. Swap the data source later by
// rewriting this file alone.
// ---------------------------------------------------------------------------

// How the search failed, so the UI can render each case distinctly. Critically,
// `out_of_credits` must never look like `no results` (an empty 200 is NOT an
// error and returns []).
export type SearchErrorKind =
  | "out_of_credits" // quota / rate limit — you are being metered off
  | "auth" // bad or missing API key
  | "bad_request" // we sent something malformed
  | "upstream"; // anything else on Channel3's side

export class ContenderSearchError extends Error {
  constructor(
    readonly kind: SearchErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ContenderSearchError";
  }
}

// Roughly 10 contenders per arena. Max the API allows is 30 (docs), we don't
// need it — fewer results, fewer credits.
const RESULT_LIMIT = 10;

// Structural subset of Channel3's `ProductDetail` — only the fields we map.
// A ProductDetail is assignable to this, so the SDK's real type still guards us.
type Channel3Product = {
  id: string;
  title: string;
  brands?: Array<{ name: string }> | null;
  images?: Array<{
    url: string;
    is_main_image?: boolean;
    is_cleaned_image?: boolean;
  }> | null;
  offers?: Array<{
    price: { price: number; currency: string; compare_at_price?: number | null };
    availability: "InStock" | "OutOfStock";
  }> | null;
  key_features?: Array<string> | null;
};

let client: Channel3 | null = null;

function getClient(): Channel3 {
  if (client) return client;
  const apiKey = process.env.CHANNEL3_API_KEY;
  if (!apiKey) {
    throw new ContenderSearchError("auth", "CHANNEL3_API_KEY is not set.");
  }
  // maxRetries: 0 — honor "no automatic retry loops on error". A metered API
  // must not silently multiply spend by retrying.
  client = new Channel3({ apiKey, maxRetries: 0 });
  return client;
}

/** Prefer a cleaned (square, uniform-background) image for the uniform grid. */
function pickImageUrl(images: Channel3Product["images"]): string | null {
  if (!images || images.length === 0) return null;
  return (
    images.find((i) => i.is_cleaned_image)?.url ??
    images.find((i) => i.is_main_image)?.url ??
    images[0]?.url ??
    null
  );
}

/** Lowest in-stock offer price; falls back to lowest overall if none in stock. */
function pickPrice(offers: Channel3Product["offers"]): Contender["price"] {
  if (!offers || offers.length === 0) return null;
  const inStock = offers.filter((o) => o.availability === "InStock");
  const pool = inStock.length > 0 ? inStock : offers;
  const best = pool.reduce((a, b) => (b.price.price < a.price.price ? b : a));
  return {
    amount: best.price.price,
    compareAt: best.price.compare_at_price ?? null,
    currency: best.price.currency,
  };
}

function toContender(p: Channel3Product): Contender {
  return {
    id: p.id,
    title: p.title,
    brand: p.brands?.[0]?.name ?? null,
    imageUrl: pickImageUrl(p.images),
    // NOTE: offer URLs are deliberately dropped here — no buy button yet, and
    // offer URLs are short-lived (docs), so they must be refetched at display
    // time, never carried around. See the caching notes in the slice summary.
    price: pickPrice(p.offers),
    keyFeatures: p.key_features ?? [],
  };
}

/**
 * Search Channel3 for one arena's contenders. The query is prose carrying the
 * hard constraints; `mode: "agentic"` lets Channel3's own LLM plan structured
 * sub-searches from that sentence (the constraint-parsing search we need).
 *
 * Metered: one credit per call. Call this ONLY for the arena the user opened.
 */
export async function searchContenders(query: string): Promise<Contender[]> {
  const c = getClient();
  try {
    const page = await c.products.search({
      query,
      limit: RESULT_LIMIT,
      config: { mode: "agentic" },
    });
    return page.products.map(toContender);
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw new ContenderSearchError(
        "out_of_credits",
        "Channel3 credits exhausted or rate limited.",
        err,
      );
    }
    if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
      throw new ContenderSearchError(
        "auth",
        "Channel3 rejected the API key.",
        err,
      );
    }
    if (err instanceof BadRequestError) {
      throw new ContenderSearchError(
        "bad_request",
        "Channel3 rejected the search request.",
        err,
      );
    }
    throw new ContenderSearchError(
      "upstream",
      "Channel3 search failed.",
      err,
    );
  }
}
