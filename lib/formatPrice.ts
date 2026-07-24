import type { Contender } from "./types";

/** Minor units -> display string. "6495" USD -> "$64.95". Display only. */
export function formatPrice(price: Contender["price"]): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency,
    }).format(price.amount / 100);
  } catch {
    // Unknown currency code — show the raw amount rather than nothing.
    return `${price.amount / 100} ${price.currency}`;
  }
}
