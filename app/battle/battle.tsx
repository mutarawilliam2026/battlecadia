"use client";

// BATTLE — the interactive half of /battle?q=...
// Winner-stays bracket over the contenders it's handed. Champion stays LEFT
// (red), challenger enters RIGHT (blue). Client state only, no persistence.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contender } from "@/lib/types";
import { identityKey } from "@/lib/dedupe";
import { formatPrice } from "@/lib/formatPrice";
import { loadMoreContenders } from "./actions";

type Matchup = { winnerId: string; loserId: string; matchNumber: number };

// Shown when the very first search is rate-limited — re-runs the server render
// (a fresh search) rather than 500-ing. No battle state exists yet to preserve.
export function InitialRateLimited({ query }: { query: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  return (
    <main className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-lg font-semibold">Rate limited</h1>
      <p className="mt-2 text-gray-600">
        The catalog is busy right now. Try &ldquo;{query}&rdquo; again in a
        moment.
      </p>
      <button
        type="button"
        onClick={() => {
          setRetrying(true);
          router.refresh();
        }}
        disabled={retrying}
        className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
      <Link href="/" className="mt-4 block text-sm underline">
        New search
      </Link>
    </main>
  );
}

export function BattleArena({
  query,
  initialBracket,
  initialLeftover,
  initialCursor,
  initialHasMore,
}: {
  query: string;
  /** Already shuffled for draw order (server-side, to match hydration). */
  initialBracket: Contender[];
  initialLeftover: Contender[];
  initialCursor: string | null;
  initialHasMore: boolean;
}) {
  const [champion, setChampion] = useState<Contender>(initialBracket[0]);
  const [queue, setQueue] = useState<Contender[]>(initialBracket.slice(1));
  const [roundTotal, setRoundTotal] = useState(initialBracket.length - 1);

  const [totalDefeated, setTotalDefeated] = useState(0);
  const [history, setHistory] = useState<Matchup[]>([]);

  // Every product identity consumed this battle — excluded from later fills so
  // nothing appears twice.
  const [seenKeys, setSeenKeys] = useState<string[]>(() =>
    initialBracket.map(identityKey),
  );
  const [leftover, setLeftover] = useState<Contender[]>(initialLeftover);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);

  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  const challenger = queue[0];
  // More rounds are possible while the catalog has pages left OR we're still
  // holding un-battled leftovers. When both run dry, the battle is truly over.
  const canLoadMore = hasMore || leftover.length > 0;

  function pick(winnerId: string) {
    const winner = winnerId === champion.id ? champion : challenger;
    const loser = winnerId === champion.id ? challenger : champion;

    const nextHistory: Matchup[] = [
      ...history,
      { winnerId: winner.id, loserId: loser.id, matchNumber: history.length + 1 },
    ];
    const nextQueue = queue.slice(1);

    setHistory(nextHistory);
    setChampion(winner);
    setQueue(nextQueue);
    setTotalDefeated((n) => n + 1);

    // Nowhere to store preference data yet — log it when the round is crowned
    // so the shape is visible.
    if (nextQueue.length === 0) {
      console.log("[battle] history", nextHistory);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    setLoadError(false);
    try {
      const res = await loadMoreContenders({
        query,
        cursor,
        canFetch: hasMore,
        excludeKeys: seenKeys,
        carryOver: leftover,
      });
      // Advance pagination state regardless — this is how the button retires,
      // and it preserves carryOver (res.leftover) across a rate-limited fetch.
      setCursor(res.cursor);
      setHasMore(res.hasMore);
      setLeftover(res.leftover);

      if (res.rateLimited) {
        // Keep the champion screen intact; the user can retry in a moment.
        setRateLimited(true);
        return;
      }
      setRateLimited(false);

      if (res.challengers.length === 0) {
        // Nothing left to bring; canLoadMore will now be false.
        return;
      }
      // Champion carries over and defends its slot against the new challengers.
      setQueue(res.challengers);
      setRoundTotal(res.challengers.length);
      setSeenKeys((keys) => [...keys, ...res.challengers.map(identityKey)]);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Round over → champion screen.
  if (!challenger) {
    return (
      <ChampionScreen
        champion={champion}
        defeated={totalDefeated}
        canLoadMore={canLoadMore}
        loadingMore={loadingMore}
        loadError={loadError}
        rateLimited={rateLimited}
        onMore={loadMore}
      />
    );
  }

  const matchNumber = roundTotal - queue.length + 1;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-baseline justify-between">
        <Link href="/" className="text-sm underline">
          ← New search
        </Link>
        <span className="font-mono text-sm tabular-nums text-gray-500">
          {pad(matchNumber)} / {pad(roundTotal)}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-stretch gap-4">
        <Card contender={champion} side="champion" onPick={() => pick(champion.id)} />
        <div className="flex items-center font-mono text-lg font-bold text-gray-400">
          VS
        </div>
        <Card contender={challenger} side="challenger" onPick={() => pick(challenger.id)} />
      </div>

      <p className="mt-4 text-right font-mono text-xs uppercase tracking-widest text-gray-500">
        {totalDefeated} defeated
      </p>
    </div>
  );
}

function ChampionScreen({
  champion,
  defeated,
  canLoadMore,
  loadingMore,
  loadError,
  rateLimited,
  onMore,
}: {
  champion: Contender;
  defeated: number;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadError: boolean;
  rateLimited: boolean;
  onMore: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-red-600">
        Champion
      </p>
      <div className="mt-4 rounded-lg border-2 border-red-500 p-6 text-left">
        <CardBody contender={champion} featureLimit={4} large />
      </div>
      <p className="mt-4 text-sm text-gray-600">Defeated {defeated} contenders</p>

      <div className="mt-6 flex justify-center gap-3">
        {rateLimited ? (
          <button
            type="button"
            onClick={onMore}
            disabled={loadingMore}
            className="rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            {loadingMore ? "Retrying…" : "Retry"}
          </button>
        ) : canLoadMore ? (
          <button
            type="button"
            onClick={onMore}
            disabled={loadingMore}
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loadingMore ? "Finding…" : "More contenders"}
          </button>
        ) : (
          <span className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-500">
            No more contenders
          </span>
        )}
        <a
          href={champion.checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-red-600 px-4 py-2 text-sm text-white"
        >
          Buy
        </a>
      </div>
      {rateLimited && (
        <p className="mt-3 text-sm text-amber-600">
          Rate limited — try again in a moment. Your champion and progress are
          safe.
        </p>
      )}
      {loadError && (
        <p className="mt-3 text-sm text-red-600">
          Couldn&rsquo;t load more. Try again.
        </p>
      )}

      <Link href="/" className="mt-6 inline-block text-sm underline">
        New search
      </Link>
    </div>
  );
}

function Card({
  contender,
  side,
  onPick,
}: {
  contender: Contender;
  side: "champion" | "challenger";
  onPick: () => void;
}) {
  const accent =
    side === "champion"
      ? "border-red-500 hover:bg-red-50"
      : "border-blue-500 hover:bg-blue-50";
  const label = side === "champion" ? "text-red-600" : "text-blue-600";
  return (
    <button
      type="button"
      onClick={onPick}
      className={`rounded-lg border-2 p-4 text-left ${accent}`}
    >
      <span className={`font-mono text-xs uppercase tracking-widest ${label}`}>
        {side}
      </span>
      <div className="mt-2">
        <CardBody contender={contender} featureLimit={3} />
      </div>
    </button>
  );
}

function CardBody({
  contender,
  featureLimit,
  large,
}: {
  contender: Contender;
  featureLimit: number;
  large?: boolean;
}) {
  return (
    <div className={large ? "flex gap-4" : ""}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={contender.imageUrl ?? ""}
        alt={contender.title}
        className={`${large ? "h-28 w-28" : "h-32 w-full"} flex-shrink-0 rounded bg-gray-100 object-contain`}
      />
      <div className="min-w-0">
        <p className="mt-2 font-medium leading-snug">{contender.title}</p>
        <p className="mt-1 text-sm">{formatPrice(contender.price)}</p>
        <p className="text-sm text-gray-500">{contender.sellerName || "—"}</p>
        <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
          {contender.features.slice(0, featureLimit).map((f, i) => (
            <li key={i}>• {f}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
