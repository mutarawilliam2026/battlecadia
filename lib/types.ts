// The Battlecadia domain contract. These shapes are OURS and are fixed.
//
// Rule: the UI only ever touches these types. Vendor types (Channel3's
// `ProductDetail`) are mapped INTO these at a single boundary (lib/channel3.ts)
// so we can swap data sources later without touching pages.

/** One product that can fight in a battle. Vendor-agnostic. */
export type Contender = {
  /** Stable product identifier we can persist and re-resolve later. */
  id: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  price: {
    amount: number;
    compareAt: number | null;
    currency: string;
  } | null;
  /** Short highlight text for battle-card copy. */
  keyFeatures: string[];
};
