import type { Contender } from "./types";

// ---------------------------------------------------------------------------
// Merge duplicate listings into one contender.
//
// Shopify returns the SAME product from different merchants as separate ids
// with different titles (confirmed live: the Sony WH-CH520 came back three
// times — from Clickbuy, GADGEX and Ivolt Ai — as three distinct ids). Without
// dedupe a product can fight itself, which is unanswerable and poisons the
// preference data.
//
// The key is a TOKEN SET: lowercase the title, drop generic filler, sort the
// remaining unique words, and match on that. Word order and marketing
// decoration stop mattering, so "Sony WH-CH520" matches "SONY WH-CH520L
// Wireless Bluetooth Headphones - Blue", but genuinely different products stay
// apart.
//
// Two deliberate calls (from the brief):
//  - "wide" is NOT filler — a wide fitting is a different product, so it stays
//    a token.
//  - Size numbers survive: "size" the word is filler, but "10.5" -> "10","5"
//    and "11" survive as tokens, so "Size 10.5" and "Size 11" don't merge.
// ---------------------------------------------------------------------------

// Words that describe the shopper or category rather than the product, so they
// carry no signal for telling two products apart. NB: no "wide" here.
const NOISE = new Set([
  "mens", "men", "man", "womens", "women", "woman", "unisex",
  "kids", "boys", "girls",
  "s", "the", "a", "an", "for", "with", "and",
  "size", "new", "style", "shoe", "shoes",
]);

function words(input: string | null | undefined): string[] {
  return (input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * The identity of a product, independent of who is listing it. Two contenders
 * with the same key are the same thing for sale in two places.
 *
 * Exported because rounds must exclude already-seen products by identity, not
 * just by id — a later page can list the same product under a new id.
 */
export function identityKey(c: Pick<Contender, "id" | "title">): string {
  const title = [...new Set(words(c.title).filter((w) => !NOISE.has(w)))]
    .sort()
    .join(" ");
  // A title made entirely of filler would collapse unrelated products together
  // — fall back to the id so we never merge things we can't prove are the same.
  return title || `id:${c.id}`;
}

/**
 * Group listings by product identity and merge each group into one contender.
 * The CHEAPEST listing becomes canonical (its price, seller and checkout win);
 * every listing's id is kept in sourceIds so the buy screen can re-resolve all
 * the merchants next slice. Group order follows first appearance, so overall
 * relevance ranking is preserved.
 */
export function mergeDuplicates(contenders: Contender[]): Contender[] {
  const groups = new Map<string, Contender[]>();
  const order: string[] = [];

  for (const c of contenders) {
    const key = identityKey(c);
    const group = groups.get(key);
    if (group) {
      group.push(c);
    } else {
      groups.set(key, [c]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    const canonical = group.reduce((a, b) =>
      b.price.amount < a.price.amount ? b : a,
    );
    const sourceIds = [...new Set(group.flatMap((c) => c.sourceIds))];
    return { ...canonical, sourceIds };
  });
}
