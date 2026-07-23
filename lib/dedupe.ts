import type { Contender } from "./types";

// ---------------------------------------------------------------------------
// Dedupe contenders before a battle. A product must never fight itself.
//
// WHY NOT product.id: measured against three live arena searches, all 30
// returned products had DISTINCT ids every time — Channel3 lists the same shoe
// from multiple merchants/feeds as separate products. Deduping by id removes
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

function identityKey(c: Contender): string {
  const brandWords = words(c.brand);
  const brand = brandWords.join(" ");
  const brandTokens = new Set(brandWords);
  const title = [
    ...new Set(words(c.title).filter((w) => !NOISE.has(w) && !brandTokens.has(w))),
  ]
    .sort()
    .join(" ");

  // A title made entirely of noise would collapse unrelated products together —
  // fall back to the id so we drop nothing we can't prove is a duplicate.
  if (!title) return `id:${c.id}`;
  return `${brand}|${title}`;
}

/**
 * Keep the first occurrence of each distinct product, in order. Search results
 * are ranked, so the first copy is the best-ranked one.
 */
export function dedupeContenders(contenders: Contender[]): Contender[] {
  const seen = new Set<string>();
  const unique: Contender[] = [];
  for (const c of contenders) {
    const key = identityKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return unique;
}
