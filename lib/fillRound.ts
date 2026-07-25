import { searchProducts } from "./shopify";
import { mergeDuplicates, identityKey } from "./dedupe";
import type { Contender } from "./types";

// ---------------------------------------------------------------------------
// Assemble one round of contenders. There is NO pre-fetched reserve: each
// round fetches pages on demand, drops anything already seen this battle,
// dedupes, and tops up until it has 10 (or gives up after a few pages).
// ---------------------------------------------------------------------------

const ROUND_SIZE = 10;
const MAX_FETCHES = 3; // cap the top-up loop so a thin query can't spin
const PAGE_LIMIT = 20; // enough that dedupe rarely leaves us short

export type FillInput = {
  query: string;
  /** Pagination cursor to continue from; null starts fresh. */
  cursor: string | null;
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
  cursor: string | null;
};

export async function fillRound({
  query,
  cursor,
  excludeKeys,
  carryOver,
}: FillInput): Promise<FillResult> {
  const exclude = new Set(excludeKeys);

  // Start from carry-over (already deduped), dropping anything since consumed.
  let pool = carryOver.filter((c) => !exclude.has(identityKey(c)));
  let cur = cursor;
  let fetches = 0;

  while (pool.length < ROUND_SIZE && fetches < MAX_FETCHES) {
    const page = await searchProducts(query, { cursor: cur, limit: PAGE_LIMIT });
    fetches++;

    const poolKeys = new Set(pool.map(identityKey));
    const fresh = page.contenders.filter((c) => {
      const k = identityKey(c);
      return !exclude.has(k) && !poolKeys.has(k);
    });

    // Re-dedupe across the whole pool so cross-page duplicates merge too.
    pool = mergeDuplicates([...pool, ...fresh]);
    cur = page.cursor;
    if (!page.hasNextPage || cur === null) {
      cur = null;
      break;
    }
  }

  return {
    round: pool.slice(0, ROUND_SIZE),
    leftover: pool.slice(ROUND_SIZE),
    cursor: cur,
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
