"use server";

import { fillRound, shuffle } from "@/lib/fillRound";
import type { Contender } from "@/lib/types";

// METERED — calls the catalog. Only ever invoked from an explicit "More
// contenders" click, never from an effect, and never retried automatically.

export type MoreRoundResult = {
  /** Fresh challengers, shuffled for draw order. Empty means no more. */
  challengers: Contender[];
  leftover: Contender[];
  cursor: string | null;
};

export async function loadMoreContenders(input: {
  query: string;
  cursor: string | null;
  excludeKeys: string[];
  carryOver: Contender[];
}): Promise<MoreRoundResult> {
  const { round, leftover, cursor } = await fillRound(input);
  return { challengers: shuffle(round), leftover, cursor };
}
