import type { Contender } from "./types";

// ---------------------------------------------------------------------------
// Winner-stays bracket. N contenders means N-1 matchups, and no ties: every
// matchup is a forced choice.
//
// The champion holds position and the next contender steps up to challenge it.
// A challenger that wins becomes the champion; the loser is out either way.
// "More contenders" appends new challengers (see addContenders) — the reigning
// champion keeps its slot and defends against each one.
//
// Pure functions, no React — the component just holds one of these in state.
// Ported from the earlier Shopify build; it was always source-agnostic, so the
// only change here is that ids are numbers (TMDB) rather than strings.
// ---------------------------------------------------------------------------

/** Fewer than this and a bracket isn't worth running. */
export const MIN_CONTENDERS = 4;

export type Matchup = {
  winnerId: number;
  loserId: number;
  matchNumber: number;
};

export type Battle = {
  /**
   * Shuffled once for draw order at the top of each round. Grows as rounds are
   * added; never reordered after a contender is in it.
   */
  contenders: Contender[];
  championIndex: number;
  /** Points past the end of `contenders` once the current round is over. */
  challengerIndex: number;
  defeatedIds: number[];
  /**
   * Every choice the user made, in order. THIS IS THE PRODUCT — it's the
   * preference data. matchNumber runs globally across rounds. Recorded from the
   * first matchup even though there is nowhere to persist it yet.
   */
  history: Matchup[];
};

/** Fisher-Yates. Returns a new array; never mutates the input. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Start a battle. Expects contenders ALREADY shuffled — shuffling happens on
 * the server so the server-rendered HTML and the hydrated client agree.
 */
export function startBattle(contenders: Contender[]): Battle {
  return {
    contenders,
    championIndex: 0,
    challengerIndex: 1,
    defeatedIds: [],
    history: [],
  };
}

/**
 * Add a fresh round of challengers. The champion sits wherever it survived, and
 * challengerIndex already points one past the end, so the appended contenders
 * become the next challengers with the champion carrying over unchanged.
 */
export function addContenders(battle: Battle, more: Contender[]): Battle {
  return { ...battle, contenders: [...battle.contenders, ...more] };
}

/** True when the current round has no challenger left to face. */
export function isOver(battle: Battle): boolean {
  return battle.challengerIndex >= battle.contenders.length;
}

/** 1-based number of the matchup on screen right now, globally across rounds. */
export function matchNumber(battle: Battle): number {
  return battle.history.length + 1;
}

export function champion(battle: Battle): Contender {
  return battle.contenders[battle.championIndex];
}

/** Undefined once the current round is over. */
export function challenger(battle: Battle): Contender | undefined {
  return battle.contenders[battle.challengerIndex];
}

/**
 * Resolve the current matchup. `winnerId` must be the champion's or the
 * challenger's id; anything else leaves the battle untouched.
 */
export function resolveMatch(battle: Battle, winnerId: number): Battle {
  if (isOver(battle)) return battle;

  const champ = champion(battle);
  const chall = challenger(battle);
  if (!chall) return battle;

  const challengerWon = winnerId === chall.id;
  if (!challengerWon && winnerId !== champ.id) return battle;

  const loser = challengerWon ? champ : chall;

  return {
    contenders: battle.contenders,
    // Winner-stays: the champion slot moves only when the challenger wins.
    championIndex: challengerWon ? battle.challengerIndex : battle.championIndex,
    challengerIndex: battle.challengerIndex + 1,
    defeatedIds: [...battle.defeatedIds, loser.id],
    history: [
      ...battle.history,
      { winnerId, loserId: loser.id, matchNumber: matchNumber(battle) },
    ],
  };
}
