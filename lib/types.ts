// The Battlecadia domain contract. These shapes are OURS and are fixed.
//
// Rule: the UI only ever touches these types. Vendor types (Channel3's
// `ProductDetail`) are mapped INTO these at a single boundary (lib/channel3.ts)
// so we can swap data sources later without touching pages.

export type Money = {
  amount: number;
  compareAt: number | null;
  currency: string;
};

/**
 * One merchant selling a contender.
 *
 * NOTE: deliberately carries NO url. Offer URLs are short-lived, so they must
 * never be cached or shipped to the browser ahead of time — the buy screen
 * refetches them at display time (see BuyOffer).
 */
export type ContenderOffer = {
  /** e.g. "zappos.com" — identifies the merchant. */
  merchantDomain: string;
  price: Money;
  availability: "InStock" | "OutOfStock";
};

/** One product that can fight in a battle. Vendor-agnostic. */
export type Contender = {
  /** The canonical listing's id. */
  id: string;
  /**
   * Every listing merged into this contender, including `id`. Different
   * merchants selling the same product arrive as separate products with
   * separate ids; the buy screen re-resolves all of them.
   */
  sourceIds: string[];
  title: string;
  brand: string | null;
  imageUrl: string | null;
  /** Lowest in-stock offer across ALL merged listings. Null if no offers. */
  price: Money | null;
  /** Merged across all listings. Used for the price above and vendor counts. */
  offers: ContenderOffer[];
  /** Short highlight text for battle-card copy. */
  keyFeatures: string[];
};

/**
 * A merchant offer as shown on the buy screen. Same as ContenderOffer plus the
 * live `url`, fetched fresh at display time and rendered immediately — never
 * stored, never carried across requests.
 */
export type BuyOffer = ContenderOffer & { url: string };
