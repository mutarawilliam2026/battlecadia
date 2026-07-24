import type { Contender, ContenderOffer } from "./types";
import { lowestPrice } from "./price";

// ---------------------------------------------------------------------------
// Merge duplicate listings into one contender.
//
// Duplicates here are not junk — they are OTHER MERCHANTS selling the same
// product, which is exactly what the buy screen needs. So we merge rather than
// discard: keep the first (best-ranked) listing as canonical, and fold every
// other listing's offers and ids into it.
//
// WHY NOT product.id: measured against three live arena searches, all 30
// returned products had DISTINCT ids every time — Channel3 lists the same shoe
// from multiple merchants/feeds as separate products. Grouping by id groups
// nothing. Example: "Ua Charged Expanse Mid Leather Waterproof Men's Hiking
// Boots" came back 3x as ZA8mX4p / Mb1Mp1y / oqios0w.
//
// Exact brand+title isn't enough either, because the same shoe is titled
// differently by each source:
//   "Asics® Novablast 5 - Men's" / "Asics Men's Novablast 5" / "Men's Asics Novablast 5"
//
// So the key is a TOKEN SET: lowercase the title, drop the brand's own words
// and generic noise ("men's", "shoes"), then sort the remaining unique words.
// Word order and marketing decoration stop mattering, but distinct models stay
// distinct ("Velociti Pace" != "Velociti Distance").
// ---------------------------------------------------------------------------

// Words that describe the shopper or the category rather than the product, so
// they carry no signal for telling two products apart.
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
 * Exported because reseeding has to exclude the reigning champion by identity,
 * not just by id.
 */
export function identityKey(c: Pick<Contender, "id" | "title" | "brand">): string {
  const brandWords = words(c.brand);
  const brand = brandWords.join(" ");
  const brandTokens = new Set(brandWords);
  const title = [
    ...new Set(words(c.title).filter((w) => !NOISE.has(w) && !brandTokens.has(w))),
  ]
    .sort()
    .join(" ");

  // A title made entirely of noise would collapse unrelated products together —
  // fall back to the id so we never merge things we can't prove are the same.
  if (!title) return `id:${c.id}`;
  return `${brand}|${title}`;
}

/** Same merchant twice for one product — keep whichever is cheaper. */
function cheapestPerMerchant(offers: ContenderOffer[]): ContenderOffer[] {
  const best = new Map<string, ContenderOffer>();
  for (const offer of offers) {
    const seen = best.get(offer.merchantDomain);
    if (!seen || offer.price.amount < seen.price.amount) {
      best.set(offer.merchantDomain, offer);
    }
  }
  return [...best.values()];
}

/**
 * Group listings by product identity and merge each group into one contender.
 * Order is preserved: search results are ranked, so the first listing of a
 * group is the best-ranked one and becomes canonical.
 */
export function mergeDuplicates(contenders: Contender[]): Contender[] {
  const groups = new Map<string, Contender>();

  for (const c of contenders) {
    const key = identityKey(c);
    const canonical = groups.get(key);

    if (!canonical) {
      groups.set(key, { ...c, sourceIds: [...c.sourceIds] });
      continue;
    }

    // Fold this listing into the canonical one. Its title, brand and image are
    // discarded — the best-ranked listing's presentation wins.
    canonical.sourceIds.push(...c.sourceIds);
    canonical.offers = cheapestPerMerchant([...canonical.offers, ...c.offers]);
  }

  // Recompute the display price across the MERGED offers. Without this we'd
  // show whichever price happened to rank first — a boot available at $99
  // elsewhere would display as $135.
  return [...groups.values()].map((c) => ({ ...c, price: lowestPrice(c.offers) }));
}
