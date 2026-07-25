"use server";

import { fillRound, shuffle } from "@/lib/fillRound";
import type { Contender } from "@/lib/types";

// METERED — calls the catalog. Only ever invoked from an explicit "More
// contenders" click, never from an effect, and never retried automatically.

export type MoreRoundResult = {
  /** Fresh challengers, shuffled for draw order. Empty means none were left. */
  challengers: Contender[];
  leftover: Contender[];
  cursor: string | null;
  /** True while the catalog still has pages left to fetch. */
  hasMore: boolean;
};

export async function loadMoreContenders(input: {
  query: string;
  cursor: string | null;
  canFetch: boolean;
  excludeKeys: string[];
  carryOver: Contender[];
}): Promise<MoreRoundResult> {
  const { round, leftover, cursor, hasMore } = await fillRound(input);
  return { challengers: shuffle(round), leftover, cursor, hasMore };
}
