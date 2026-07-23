import type { Contender } from "./types";

// ---------------------------------------------------------------------------
// Winner-stays bracket. N contenders means N-1 matchups, and no ties: every
// matchup is a forced choice.
//
// The champion holds position and the next contender steps up to challenge it.
// A challenger that wins becomes the champion; the loser is out either way.
//
// Pure functions, no React — the component just holds one of these in state.
// ---------------------------------------------------------------------------

/** Fewer than this and a bracket isn't worth running. */
export const MIN_CONTENDERS = 4;

export type Matchup = {
  winnerId: string;
  loserId: string;
  matchNumber: number;
};

export type Battle = {
  /** Shuffled and deduped once, at battle start. Never reordered after. */
  contenders: Contender[];
  championIndex: number;
  /** Points past the end of `contenders` once the battle is over. */
  challengerIndex: number;
  defeatedIds: string[];
  /**
   * Every choice the user made, in order. THIS IS THE PRODUCT — it's the
   * preference data. Recorded from the first matchup even though there is
   * nowhere to persist it yet.
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

export function isOver(battle: Battle): boolean {
  return battle.challengerIndex >= battle.contenders.length;
}

/** 1-based number of the matchup on screen right now. */
export function matchNumber(battle: Battle): number {
  return battle.history.length + 1;
}

/** N contenders, N-1 matchups. */
export function totalMatches(battle: Battle): number {
  return Math.max(battle.contenders.length - 1, 0);
}

export function champion(battle: Battle): Contender {
  return battle.contenders[battle.championIndex];
}

/** Undefined once the battle is over. */
export function challenger(battle: Battle): Contender | undefined {
  return battle.contenders[battle.challengerIndex];
}

/**
 * Resolve the current matchup. `winnerId` must be the champion's or the
 * challenger's id; anything else leaves the battle untouched.
 */
export function resolveMatch(battle: Battle, winnerId: string): Battle {
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
