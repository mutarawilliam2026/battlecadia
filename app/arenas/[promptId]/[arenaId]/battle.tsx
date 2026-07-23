"use client";

// BATTLE — the interactive half of /arenas/{promptId}/{arenaId}
// Runs the winner-stays bracket over the contenders it is handed.
// Receives them as a prop; fetches nothing itself.

import { useState } from "react";
import Link from "next/link";
import type { Contender } from "@/lib/types";
import {
  type Battle,
  challenger,
  champion,
  isOver,
  matchNumber,
  resolveMatch,
  startBattle,
  totalMatches,
} from "@/lib/battle";
import { formatPrice } from "@/lib/format";

export function BattleArena({
  contenders,
  promptId,
}: {
  contenders: Contender[];
  promptId: string;
}) {
  const [battle, setBattle] = useState<Battle>(() => startBattle(contenders));

  function pick(winnerId: string) {
    const next = resolveMatch(battle, winnerId);
    if (next === battle) return; // not a valid pick for this matchup

    // Nowhere to store preference data yet — log it so the shape is visible.
    if (isOver(next)) {
      console.log("[battle] history", next.history);
    }
    setBattle(next);
  }

  const champ = champion(battle);

  if (isOver(battle)) {
    return <ChampionScreen champ={champ} battle={battle} promptId={promptId} />;
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
        {battle.defeatedIds.length} defeated
      </p>
    </div>
  );
}

function ChampionScreen({
  champ,
  battle,
  promptId,
}: {
  champ: Contender;
  battle: Battle;
  promptId: string;
}) {
  const defeated = battle.defeatedIds.length;
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
      </div>

      <p className="mt-4 text-center text-sm text-gray-500">
        Defeated {defeated} {defeated === 1 ? "contender" : "contenders"}
      </p>

      <p className="mt-6 text-center">
        <Link href={`/arenas/${promptId}`} className="underline">
          Battle again
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
