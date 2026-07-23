// The Battlecadia domain contract. These shapes are OURS and are fixed.
//
// Rule: the UI and route handlers only ever touch these types. Vendor types
// (Channel3's `ProductDetail`, Gemini's response) are mapped INTO these at a
// single boundary (see lib/channel3.ts and lib/gemini.ts) so we can swap data
// sources later without touching pages.

/** A framing of the search — one bracket the user can enter. */
export type Arena = {
  /** kebab-case slug; also the [arenaId] URL segment. */
  id: string;
  /** 1-3 words, chip-sized. */
  label: string;
  /** <= 60 chars, why a buyer picks this arena. */
  blurb: string;
  /** Which dimension this arena competes on. */
  axis: "style" | "use_case" | "price" | "color" | "condition" | "quality";
  /**
   * Natural-language query sent to the product source. MUST restate the hard
   * constraints inline — each arena is searched independently and nothing else
   * carries them.
   */
  searchQuery: string;
};

/** A user's request, plus the arenas Gemini generated from it. */
export type Prompt = {
  id: string;
  /** Exactly what the user typed. */
  text: string;
  /** Plain-English restatement of the non-negotiables (for eyeballing). */
  hardConstraints: string;
  /** 3-5 arenas. */
  arenas: Arena[];
};

/** One product that can fight in an arena. Vendor-agnostic. */
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
  /** Short highlight text for battle-card copy (feeds the next slice). */
  keyFeatures: string[];
};
