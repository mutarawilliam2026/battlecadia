"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Matchup } from "@/lib/battle";
import type { AppliedChip, SearchPlan } from "@/lib/types";

// PERSISTENCE — write a finished (or abandoned) battle and all its matchups.
//
// Called when a battle ends: a champion is crowned, or the user leaves after at
// least one matchup (abandoned battles are still preference data). Runs entirely
// server-side on the secret-key client, which bypasses RLS — that's why
// `battles`/`matchups` need no client insert policy for anonymous play to work.
//
// Auth is OFF, so `userId` is always null today; `sessionId` (a per-browser id)
// is always sent so these anonymous rows can be claimed once login ships.

export type SaveBattleInput = {
  /** Per-browser id (localStorage). Lets us claim anon battles after login. */
  sessionId: string;
  /** Set to a real user once auth is enabled; null for anonymous play. */
  userId: string | null;
  arena: string;
  prompt: string;
  /** The resolved search Gemini produced (the MovieQuery / plan). */
  resolvedQuery: SearchPlan | null;
  /** The refinement chips applied to the pool. */
  appliedRefinements: AppliedChip[];
  /** Final (or current, if abandoned) champion. */
  championTmdbId: number | null;
  /** contenders[0].id — the incumbent going into match 1, for the defense flag. */
  initialChampionId: number | null;
  /** Number of rounds played (starts at 1; +1 per "More contenders"). */
  rounds: number;
  /** The battle loop's history, in order. The source of the matchups rows. */
  history: Matchup[];
};

export type SaveBattleResult = {
  battleId: string;
  matchups: number;
};

export async function saveBattle(
  input: SaveBattleInput,
): Promise<SaveBattleResult> {
  const supabase = createSupabaseServiceClient();

  // Insert the battle first so we have its id for the matchups' FK.
  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .insert({
      user_id: input.userId,
      session_id: input.sessionId,
      arena: input.arena,
      prompt: input.prompt,
      resolved_query: input.resolvedQuery,
      applied_refinements: input.appliedRefinements,
      champion_tmdb_id: input.championTmdbId,
      total_matches: input.history.length,
      rounds: input.rounds,
    })
    .select("id")
    .single();

  if (battleError || !battle) {
    throw new Error(`saveBattle: battle insert failed: ${battleError?.message}`);
  }

  // Winner-stays: the champion going into match 1 is contenders[0]; after each
  // match the winner holds the slot. So a matchup is a "champion defense" when
  // its winner was the incumbent going in — i.e. the previous match's winner
  // (or the initial champion for match 1).
  let incumbentId = input.initialChampionId;
  const matchupRows = input.history.map((h) => {
    const wasDefense = incumbentId !== null && h.winnerId === incumbentId;
    incumbentId = h.winnerId;
    return {
      battle_id: battle.id as string,
      winner_tmdb_id: h.winnerId,
      loser_tmdb_id: h.loserId,
      match_number: h.matchNumber,
      was_champion_defense: wasDefense,
    };
  });

  if (matchupRows.length > 0) {
    const { error: matchupError } = await supabase
      .from("matchups")
      .insert(matchupRows);

    if (matchupError) {
      // Keep the two writes atomic-ish: an orphan battle with no matchups is
      // worse than nothing, so undo it (cascade cleans any partial rows).
      await supabase.from("battles").delete().eq("id", battle.id);
      throw new Error(`saveBattle: matchups insert failed: ${matchupError.message}`);
    }
  }

  return { battleId: battle.id as string, matchups: matchupRows.length };
}
