import type { Contender } from "./types";
import { getAccessToken } from "./shopifyAuth";

// ---------------------------------------------------------------------------
// The single Shopify boundary. Pages call `searchProducts` and get back OUR
// Contender type — they never see the Global Catalog response shape. Swap the
// data source later by rewriting this file alone.
//
// Endpoint + request/response shapes were derived from the live Global Catalog
// MCP endpoint (shopify.dev/docs/agents), not from memory. JSON-RPC 2.0.
// Requests are authenticated (Authorization: Bearer) — the anonymous tier is
// rate-limited to ~3 pages before returning 429.
// ---------------------------------------------------------------------------

const ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const PROTOCOL_VERSION = "2026-03-26";
const DEFAULT_LIMIT = 20;

// A 429 is backed off once (never retried immediately), waiting Retry-After if
// present, capped so an SSR render can't hang.
const DEFAULT_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 8000;

/** Thrown when the catalog is still rate-limited after one backed-off retry. */
export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number | null) {
    super("Global Catalog is rate limited.");
    this.name = "RateLimitError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry-After may be seconds or an HTTP date; return ms, capped. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, MAX_BACKOFF_MS);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.min(Math.max(when - Date.now(), 0), MAX_BACKOFF_MS);
  return null;
}

/**
 * POST to the catalog with a bearer token. Refreshes the token once on 401,
 * and on 429 backs off (Retry-After, capped) then retries ONCE before throwing
 * RateLimitError.
 */
async function callCatalog(body: object): Promise<Response> {
  const send = async () => {
    const token = await getAccessToken();
    return fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      // Product data must never be cached.
      cache: "no-store",
    });
  };

  let res = await send();

  // Token rejected — refresh and retry once (not a rate-limit situation).
  if (res.status === 401) {
    await getAccessToken(true);
    res = await send();
  }

  // Rate limited — back off, then one retry. NEVER retry immediately.
  if (res.status === 429) {
    await sleep(parseRetryAfter(res.headers.get("retry-after")) ?? DEFAULT_BACKOFF_MS);
    res = await send();
    if (res.status === 429) {
      throw new RateLimitError(parseRetryAfter(res.headers.get("retry-after")));
    }
  }

  return res;
}

// TODO(before launch): replace this with OUR OWN published UCP agent profile.
// This is Shopify's sample profile and must not ship to production.
const AGENT_PROFILE =
  "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";

export type SearchResult = {
  contenders: Contender[];
  /** Total matches in the catalog (pagination.total_count), not just this page. */
  totalCount: number;
  /** Opaque cursor for the next page; null when the catalog is exhausted. */
  cursor: string | null;
  hasNextPage: boolean;
};

// --- Minimal structural view of the response. A real response is assignable to
// this, so we map defensively but stay typed. Only the fields we use appear.
type CatalogPrice = { amount: number; currency: string };
type CatalogVariant = {
  id: string;
  price: CatalogPrice;
  seller?: { name?: string; domain?: string } | null;
  checkout_url?: string | null;
};
type CatalogProduct = {
  id: string;
  title: string;
  media?: Array<{ url: string }> | null;
  variants?: CatalogVariant[] | null;
  // metadata is present on ~most products, not all — top_features is a single
  // NEWLINE-DELIMITED string, not an array.
  metadata?: { top_features?: string | null } | null;
};
type CatalogResponse = {
  result?: {
    structuredContent?: {
      products?: CatalogProduct[];
      pagination?: {
        total_count?: number;
        cursor?: string | null;
        has_next_page?: boolean;
      };
    };
  };
  error?: { code: number; message: string; data?: unknown };
};

/**
 * Parse a budget ceiling out of the sentence — "under $50", "less than $50",
 * "below $50", "up to $50" — and return it in MINOR units ($50 -> 5000). No
 * LLM. Returns null when no budget is stated, so the caller omits the filter.
 */
export function parseBudgetCeiling(query: string): number | null {
  const m = query
    .toLowerCase()
    .match(/(?:under|less than|below|up to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const dollars = Number.parseFloat(m[1]);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

/** Map one catalog product to a Contender, or null if it can't be used. */
function toContender(product: CatalogProduct): Contender | null {
  const variant = product.variants?.[0];
  if (!variant?.id || !variant.price) return null;

  // Currency is NOT pinned by the request context (verified live: US context
  // still returns USD/GBP/INR). A head-to-head needs comparable prices, so we
  // keep only USD here. TODO: proper multi-currency handling / conversion.
  if (variant.price.currency !== "USD") return null;

  const features = (product.metadata?.top_features ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    id: product.id,
    // One listing so far. Dedupe folds in duplicate listings' ids.
    sourceIds: [product.id],
    variantId: variant.id,
    title: product.title,
    imageUrl: product.media?.[0]?.url ?? null,
    price: { amount: variant.price.amount, currency: variant.price.currency },
    features,
    sellerName: variant.seller?.name ?? "",
    sellerDomain: variant.seller?.domain ?? "",
    checkoutUrl: variant.checkout_url ?? "",
  };
}

/**
 * Search the Global Catalog for one query. Always sends US context; adds a
 * structured price filter only when the sentence states a budget. The rest of
 * the sentence rides in `catalog.query` untouched.
 *
 * Pass `cursor` (from a previous result) to page through the same search —
 * verified live: `pagination.cursor` returns the next page with no overlap.
 */
export async function searchProducts(
  query: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<SearchResult> {
  const ceiling = parseBudgetCeiling(query);

  const pagination: Record<string, unknown> = {
    limit: opts.limit ?? DEFAULT_LIMIT,
  };
  if (opts.cursor) pagination.cursor = opts.cursor;

  const catalog: Record<string, unknown> = {
    query,
    // address_country avoids some of the mixed-currency mess; currency is a
    // soft localization hint. Neither is a hard filter (verified live).
    context: { address_country: "US", currency: "USD" },
    pagination,
  };
  if (ceiling !== null) {
    catalog.filters = { price: { max: ceiling } };
  }

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "search_catalog",
      arguments: {
        catalog,
        // The agent profile lives INSIDE arguments, beside catalog (verified
        // live — params-level placement is rejected).
        meta: { "ucp-agent": { profile: AGENT_PROFILE } },
      },
    },
  };

  const res = await callCatalog(body);

  if (!res.ok) {
    throw new Error(`Global Catalog search failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as CatalogResponse;
  if (json.error) {
    throw new Error(`Global Catalog error ${json.error.code}: ${json.error.message}`);
  }

  const sc = json.result?.structuredContent;
  const products = sc?.products ?? [];
  const contenders = products
    .map(toContender)
    .filter((c): c is Contender => c !== null);

  return {
    contenders,
    totalCount: sc?.pagination?.total_count ?? 0,
    cursor: sc?.pagination?.cursor ?? null,
    hasNextPage: sc?.pagination?.has_next_page ?? false,
  };
}
