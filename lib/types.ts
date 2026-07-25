// The Battlecadia domain contract. This shape is OURS and is fixed.
//
// Rule: the UI only ever touches this type. Shopify's Global Catalog response
// shape is mapped INTO it at a single boundary (lib/shopify.ts) so the data
// source can be swapped without touching pages.

export type Contender = {
  id: string; // gid://shopify/p/... — the canonical (cheapest) listing.
  /**
   * Every listing merged into this contender, including `id`. Shopify returns
   * the same product from different merchants as separate ids; dedupe folds
   * them here so the buy screen (next slice) can re-resolve every seller.
   */
  sourceIds: string[];
  variantId: string; // gid://shopify/ProductVariant/...
  title: string;
  imageUrl: string | null;
  /** amount is in MINOR UNITS (6495 = $64.95). Format for display only. */
  price: { amount: number; currency: string };
  /** battle-card copy; may be empty ([]) when the product has none. */
  features: string[];
  sellerName: string;
  sellerDomain: string;
  checkoutUrl: string;
};
