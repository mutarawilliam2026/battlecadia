import type { Contender } from "./types";

/** "$154.95", or "$43.99 (was $84.22)" when there's a compare-at price. */
export function formatPrice(price: Contender["price"]): string {
  if (!price) return "Price unavailable";
  try {
    const money = (amount: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: price.currency,
      }).format(amount);

    const current = money(price.amount);
    if (price.compareAt && price.compareAt > price.amount) {
      return `${current} (was ${money(price.compareAt)})`;
    }
    return current;
  } catch {
    // Unknown currency code — show the raw numbers rather than nothing.
    return `${price.amount} ${price.currency}`;
  }
}
