import type { ContenderOffer, Money } from "./types";

/**
 * The price we display: the cheapest in-stock offer, falling back to the
 * cheapest offer overall when nothing is in stock.
 *
 * This runs AFTER duplicate listings are merged, so it sees every merchant
 * selling the product — not just whichever listing the search ranked first.
 */
export function lowestPrice(offers: ContenderOffer[]): Money | null {
  if (offers.length === 0) return null;
  const inStock = offers.filter((o) => o.availability === "InStock");
  const pool = inStock.length > 0 ? inStock : offers;
  return pool.reduce((a, b) => (b.price.amount < a.price.amount ? b : a)).price;
}
