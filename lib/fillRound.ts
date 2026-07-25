import { searchProducts, RateLimitError } from "./shopify";
import { mergeDuplicates, identityKey } from "./dedupe";
import type { Contender } from "./types";

// ---------------------------------------------------------------------------
// Assemble one round of contenders. There is NO pre-fetched reserve: each
// round follows the catalog cursor on demand, drops anything already seen this
// battle, dedupes, and tops up toward 10.
//
// Rounds are NOT capped. A fill keeps paging as long as the catalog hands back
// a next cursor; it stops only when it has 10 or the cursor runs out. When the
// cursor is exhausted it brings back whatever is left — even a single
// contender — and reports hasMore:false so the caller can retire the button.
// ---------------------------------------------------------------------------

const ROUND_SIZE = 10;
const PAGE_LIMIT = 20; // enough that dedupe rarely leaves us short

// The catalog keeps reporting has_next_page:true and handing out cursors even
// after it has run out of products — later pages just come back empty. So we
// also stop after this many consecutive fetches that add nothing new, instead
// of chasing empty pages forever (which would hammer the API).
const MAX_NO_PROGRESS_FETCHES = 2;

export type FillInput = {
  query: string;
  /** Cursor to continue from. null = start of results (round 1 only). */
  cursor: string | null;
  /**
   * Whether the catalog still has pages to fetch. Round 1 passes true (with a
   * null cursor, meaning "start"). Later rounds pass the previous fill's
   * hasMore — so a null cursor there means "exhausted", NOT "restart page 1".
   */
  canFetch: boolean;
  /** Identity keys already consumed this battle (won or lost). */
  excludeKeys: string[];
  /** Deduped pool left over from the previous fill — reused before refetching. */
  carryOver: Contender[];
};

export type FillResult = {
  /** Up to 10, in RELEVANCE order. The caller shuffles these for draw order. */
  round: Contender[];
  /** Anything beyond 10 — carries into the next fill so we don't refetch. */
  leftover: Contender[];
  /** Cursor to pass to the next fill. null once the catalog is exhausted. */
  cursor: string | null;
  /** True while the catalog still has pages left to fetch. */
  hasMore: boolean;
  /**
   * True when a fetch was rate-limited before the round could be built. The
   * round is empty; everything gathered so far (including carryOver) is
   * returned as leftover so a retry loses nothing.
   */
  rateLimited: boolean;
};

export async function fillRound({
  query,
  cursor,
  canFetch,
  excludeKeys,
  carryOver,
}: FillInput): Promise<FillResult> {
  const exclude = new Set(excludeKeys);

  // Start from carry-over (already deduped), dropping anything since consumed.
  let pool = carryOver.filter((c) => !exclude.has(identityKey(c)));
  let cur = cursor;
  let more = canFetch;
  let noProgress = 0;

  // Keep paging until the round is full or the catalog stops producing new
  // products. Not capped by page count — a query with deep data yields dozens
  // of rounds — only by running out of cursor or hitting empty pages.
  while (pool.length < ROUND_SIZE && more) {
    let page;
    try {
      page = await searchProducts(query, { cursor: cur, limit: PAGE_LIMIT });
    } catch (err) {
      if (err instanceof RateLimitError) {
        // Stop here WITHOUT advancing the cursor — the same page is retried
        // next time. Hand back everything gathered so far (carryOver included)
        // as leftover so a retry starts from the same place and loses nothing.
        return { round: [], leftover: pool, cursor: cur, hasMore: more, rateLimited: true };
      }
      throw err;
    }

    const before = pool.length;
    const poolKeys = new Set(pool.map(identityKey));
    const fresh = page.contenders.filter((c) => {
      const k = identityKey(c);
      return !exclude.has(k) && !poolKeys.has(k);
    });

    // Re-dedupe across the whole pool so cross-page duplicates merge too.
    pool = mergeDuplicates([...pool, ...fresh]);
    cur = page.cursor;
    // A null next-cursor (or has_next_page:false) means there are no more pages.
    more = page.hasNextPage && cur !== null;

    // Bail out of empty/all-seen pages rather than chasing them forever.
    if (pool.length === before) {
      if (++noProgress >= MAX_NO_PROGRESS_FETCHES) more = false;
    } else {
      noProgress = 0;
    }
  }

  return {
    round: pool.slice(0, ROUND_SIZE),
    leftover: pool.slice(ROUND_SIZE),
    cursor: cur,
    hasMore: more,
    rateLimited: false,
  };
}

/** Fisher–Yates. Returns a new array; leaves the input untouched. */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
