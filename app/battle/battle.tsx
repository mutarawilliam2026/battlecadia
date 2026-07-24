"use client";

// BATTLE — the interactive half of /battle?q=...
// Runs the winner-stays bracket over the contenders it is handed.
// Receives them as a prop; fetches nothing itself.

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Contender } from "@/lib/types";
import {
  type Battle,
  type Matchup,
  challenger,
  champion,
  isOver,
  matchNumber,
  resolveMatch,
  startBattle,
  totalMatches,
} from "@/lib/battle";
import { identityKey } from "@/lib/dedupe";
import { formatPrice } from "@/lib/format";
import { loadMoreContenders } from "./actions";

/** How many fresh challengers a reseed round brings in. */
const ROUND_SIZE = 10;

export function BattleArena({
  contenders,
  reserve: initialReserve,
  query,
  pageToken: initialPageToken,
}: {
  contenders: Contender[];
  /** Fetched in the same search but held back — reseeding costs no credits. */
  reserve: Contender[];
  query: string;
  pageToken: string | null;
}) {
  const [battle, setBattle] = useState<Battle>(() => startBattle(contenders));
  const [reserve, setReserve] = useState<Contender[]>(initialReserve);
  const [pageToken, setPageToken] = useState<string | null>(initialPageToken);
  const [exhausted, setExhausted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Defeated ACCUMULATES across rounds — the running tally is the reward for
  // continuing. `battle` only knows about the round it is in.
  const [carriedDefeated, setCarriedDefeated] = useState(0);
  const [carriedHistory, setCarriedHistory] = useState<Matchup[]>([]);

  // Every product identity that has already appeared, so a later page can't
  // reintroduce something the user has seen.
  const [seenKeys, setSeenKeys] = useState<Set<string>>(
    () => new Set([...contenders, ...initialReserve].map(identityKey)),
  );

  const champ = champion(battle);
  const defeatedTotal = carriedDefeated + battle.defeatedIds.length;

  function pick(winnerId: string) {
    const next = resolveMatch(battle, winnerId);
    if (next === battle) return; // not a valid pick for this matchup

    // Nowhere to store preference data yet — log it so the shape is visible.
    if (isOver(next)) {
      console.log("[battle] history", [...carriedHistory, ...next.history]);
    }
    setBattle(next);
  }

  /** Contenders eligible to challenge the reigning champion. */
  function eligible(pool: Contender[], reigning: Contender): Contender[] {
    const championKey = identityKey(reigning);
    const championSources = new Set(reigning.sourceIds);
    const defeated = new Set([...carriedHistory, ...battle.history].map((m) => m.loserId));

    return pool.filter((c) => {
      // The champion must never face itself — not under a different listing id,
      // and not under a merged sibling id either.
      if (identityKey(c) === championKey) return false;
      if (c.sourceIds.some((id) => championSources.has(id))) return false;
      return !c.sourceIds.some((id) => defeated.has(id));
    });
  }

  function startRound(challengers: Contender[], nextReserve: Contender[]) {
    setCarriedDefeated(defeatedTotal);
    setCarriedHistory([...carriedHistory, ...battle.history]);
    setReserve(nextReserve);
    // The reigning champion carries over as contender 0 and defends its slot.
    setBattle(startBattle([champ, ...challengers]));
  }

  function moreContenders() {
    setLoadError(null);
    const ready = eligible(reserve, champ);

    // Reserve can cover the round — instant, zero API calls.
    if (ready.length >= ROUND_SIZE) {
      const taken = ready.slice(0, ROUND_SIZE);
      const takenIds = new Set(taken.map((c) => c.id));
      startRound(taken, reserve.filter((c) => !takenIds.has(c.id)));
      return;
    }

    // Reserve is short. Nothing left to page through means this really is the end.
    if (!pageToken) {
      if (ready.length === 0) {
        setExhausted(true);
        return;
      }
      const takenIds = new Set(ready.map((c) => c.id));
      startRound(ready, reserve.filter((c) => !takenIds.has(c.id)));
      setExhausted(true); // last round we can offer
      return;
    }

    // METERED: one credit, and only because the user asked for more.
    startTransition(async () => {
      const result = await loadMoreContenders(query, pageToken);
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }

      const fresh = result.contenders.filter((c) => !seenKeys.has(identityKey(c)));
      setPageToken(result.nextPageToken);
      setSeenKeys(new Set([...seenKeys, ...fresh.map(identityKey)]));

      const pool = [...reserve, ...fresh];
      const ready2 = eligible(pool, champ);

      // Pagination returned nothing usable — stop offering the button.
      if (ready2.length === 0) {
        setReserve(pool);
        setExhausted(true);
        return;
      }

      const taken = ready2.slice(0, ROUND_SIZE);
      const takenIds = new Set(taken.map((c) => c.id));
      startRound(taken, pool.filter((c) => !takenIds.has(c.id)));
    });
  }

  if (isOver(battle)) {
    return (
      <ChampionScreen
        champ={champ}
        defeated={defeatedTotal}
        query={query}
        exhausted={exhausted}
        pending={pending}
        error={loadError}
        onMore={moreContenders}
      />
    );
  }

  const chall = challenger(battle);
  if (!chall) return null;

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-widest text-gray-400">
          Pick a winner
        </p>
        <p className="font-mono text-sm tabular-nums text-gray-500">
          {pad(matchNumber(battle))} / {pad(totalMatches(battle))}
        </p>
      </div>

      {/* Champion is ALWAYS on the left, even after it changes hands. Cards that
          swap sides make people lose track of which one they were reading. */}
      <div className="mt-4 flex items-stretch gap-4">
        <Card
          contender={champ}
          role="CHAMPION"
          onPick={() => pick(champ.id)}
          className="border-red-500 hover:bg-red-50"
          roleClassName="text-red-600"
        />

        <div className="flex items-center text-lg font-bold text-gray-400">
          VS
        </div>

        <Card
          contender={chall}
          role="CHALLENGER"
          onPick={() => pick(chall.id)}
          className="border-blue-500 hover:bg-blue-50"
          roleClassName="text-blue-600"
        />
      </div>

      <p className="mt-4 text-right text-xs uppercase tracking-widest text-gray-400">
        {defeatedTotal} defeated
      </p>
    </div>
  );
}

function ChampionScreen({
  champ,
  defeated,
  query,
  exhausted,
  pending,
  error,
  onMore,
}: {
  champ: Contender;
  defeated: number;
  query: string;
  exhausted: boolean;
  pending: boolean;
  error: string | null;
  onMore: () => void;
}) {
  const vendors = champ.offers.length;
  // Every listing merged into this product — the buy screen re-resolves them
  // all to find every shop selling it.
  const buyHref = `/buy?ids=${encodeURIComponent(champ.sourceIds.join(","))}&q=${encodeURIComponent(query)}`;

  return (
    <div className="mt-6">
      <p className="text-xs uppercase tracking-widest text-red-600">Champion</p>

      <div className="mt-3 rounded border-2 border-red-500 p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={champ.imageUrl ?? ""}
          alt={champ.title}
          width={192}
          height={192}
          className="mx-auto h-48 w-48 rounded bg-gray-100 object-contain"
        />
        <p className="mt-4 text-center text-lg font-semibold">{champ.title}</p>
        <p className="text-center text-sm text-gray-500">{champ.brand ?? "—"}</p>
        <p className="mt-1 text-center">{formatPrice(champ.price)}</p>
        {vendors > 1 && (
          <p className="mt-1 text-center text-xs text-gray-400">
            {vendors} shops
          </p>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-gray-500">
        Defeated {defeated} {defeated === 1 ? "contender" : "contenders"}
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        {exhausted ? (
          <p className="text-sm text-gray-500">
            No more contenders — this one wins
          </p>
        ) : (
          <button
            type="button"
            onClick={onMore}
            disabled={pending}
            className="rounded border-2 border-gray-300 px-4 py-2 disabled:opacity-50"
          >
            {pending ? "Finding more…" : "More contenders"}
          </button>
        )}

        <Link
          href={buyHref}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Buy
        </Link>
      </div>

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

      <p className="mt-6 text-center">
        <Link href="/" className="text-sm underline">
          New battle
        </Link>
      </p>
    </div>
  );
}

function Card({
  contender,
  role,
  onPick,
  className,
  roleClassName,
}: {
  contender: Contender;
  role: string;
  onPick: () => void;
  className: string;
  roleClassName: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex flex-1 flex-col rounded border-2 p-4 text-left ${className}`}
    >
      <span className={`text-xs uppercase tracking-widest ${roleClassName}`}>
        {role}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={contender.imageUrl ?? ""}
        alt={contender.title}
        width={160}
        height={160}
        className="mx-auto mt-3 h-40 w-40 rounded bg-gray-100 object-contain"
      />
      <span className="mt-3 font-medium">{contender.title}</span>
      <span className="text-sm text-gray-500">{contender.brand ?? "—"}</span>
      <span className="mt-1 text-sm">{formatPrice(contender.price)}</span>
    </button>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
