import "server-only";

import {
  Channel3,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  BadRequestError,
} from "@channel3/sdk";
import type { BuyOffer, Contender, ContenderOffer } from "./types";
import { mergeDuplicates } from "./dedupe";
import { lowestPrice } from "./price";

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

// Ask for the maximum the API allows. Pricing is per CALL, not per result, so
// 30 costs exactly what 10 costs — and we need the headroom, both because
// duplicate listings collapse together (see lib/dedupe.ts) and because the
// leftovers become the reserve pool that reseeding draws from.
const RESULT_LIMIT = 30;

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
    domain: string;
    url: string;
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

/**
 * Map merchant offers, DROPPING the url. Offer URLs are short-lived (docs), so
 * they must never be carried around or shipped to the browser in advance — the
 * buy screen refetches them at display time via `fetchBuyOffers`.
 */
function toOffers(offers: Channel3Product["offers"]): ContenderOffer[] {
  if (!offers) return [];
  return offers.map((o) => ({
    merchantDomain: o.domain,
    availability: o.availability,
    price: {
      amount: o.price.price,
      compareAt: o.price.compare_at_price ?? null,
      currency: o.price.currency,
    },
  }));
}

function toContender(p: Channel3Product): Contender {
  const offers = toOffers(p.offers);
  return {
    id: p.id,
    // One listing so far. Duplicate listings of the same product get folded in
    // by mergeDuplicates, which appends their ids here.
    sourceIds: [p.id],
    title: p.title,
    brand: p.brands?.[0]?.name ?? null,
    imageUrl: pickImageUrl(p.images),
    price: lowestPrice(offers),
    offers,
    keyFeatures: p.key_features ?? [],
  };
}

export type ContenderPage = {
  contenders: Contender[];
  /** Pass back in to fetch the next page. Null when the catalog is exhausted. */
  nextPageToken: string | null;
};

/**
 * Search Channel3 for contenders. `mode: "agentic"` lets Channel3's own LLM
 * plan structured sub-searches from the user's sentence, so natural-language
 * constraints ("under $50") are parsed without a separate LLM step.
 *
 * Over-fetches and merges duplicate listings; returns ALL survivors. The caller
 * decides how many enter the battle and how many are held in reserve.
 *
 * Metered: one credit per call. Call this ONLY on an explicit user action.
 */
export async function searchContenders(
  query: string,
  pageToken?: string | null,
): Promise<ContenderPage> {
  const c = getClient();
  try {
    const page = await c.products.search({
      query,
      limit: RESULT_LIMIT,
      config: { mode: "agentic" },
      // Continues the same result set rather than re-running the search.
      ...(pageToken ? { page_token: pageToken } : {}),
    });
    return {
      contenders: mergeDuplicates(page.products.map(toContender)),
      nextPageToken: page.next_page_token ?? null,
    };
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

export type BuyListing = {
  title: string;
  brand: string | null;
  imageUrl: string | null;
  /** Cheapest offer per merchant, cheapest merchant first. */
  offers: BuyOffer[];
};

/**
 * Re-resolve a product's live offers for the buy screen, by every id that was
 * merged into it.
 *
 * FREE endpoint (GET /v1/products/{id}) — unlike search, this costs no credits,
 * so fanning out across a handful of ids is free. The docs prescribe exactly
 * this: cache ids, never offer data, and refetch at display time because offer
 * URLs are short-lived.
 *
 * Runs the ids in parallel and tolerates individual failures — one dead id
 * shouldn't hide the other merchants.
 */
export async function fetchBuyListing(ids: string[]): Promise<BuyListing | null> {
  const c = getClient();
  const results = await Promise.allSettled(
    ids.map((id) => c.products.retrieve(id)),
  );

  const products: Channel3Product[] = [];
  for (const [i, r] of results.entries()) {
    if (r.status === "fulfilled") products.push(r.value);
    else console.error(`[channel3] product ${ids[i]} failed to resolve:`, r.reason);
  }
  if (products.length === 0) return null;

  // Cheapest offer per merchant domain across every listing, cheapest first.
  const best = new Map<string, BuyOffer>();
  for (const p of products) {
    for (const o of p.offers ?? []) {
      const offer: BuyOffer = {
        merchantDomain: o.domain,
        url: o.url,
        availability: o.availability,
        price: {
          amount: o.price.price,
          compareAt: o.price.compare_at_price ?? null,
          currency: o.price.currency,
        },
      };
      const seen = best.get(offer.merchantDomain);
      if (!seen || offer.price.amount < seen.price.amount) {
        best.set(offer.merchantDomain, offer);
      }
    }
  }

  const canonical = products[0];
  return {
    title: canonical.title,
    brand: canonical.brands?.[0]?.name ?? null,
    imageUrl: pickImageUrl(canonical.images),
    offers: [...best.values()].sort((a, b) => a.price.amount - b.price.amount),
  };
}
