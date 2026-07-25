"use client";

// BATTLE — the interactive half of /battle?q=...
// Winner-stays bracket over the contenders it's handed. Champion stays LEFT
// (red), challenger enters RIGHT (blue). Client state only, no persistence.
// It owns the round buffer and calls server actions to page TMDB on demand.

import { useState } from "react";
import Link from "next/link";
import type {
  Contender,
  SearchPlan,
  WatchProvider,
  WatchProviders,
} from "@/lib/types";
import {
  type Battle,
  addContenders,
  challenger,
  champion,
  isOver,
  resolveMatch,
  shuffle,
  startBattle,
} from "@/lib/battle";
import { loadMorePage, fetchWatchProviders } from "./actions";

const ROUND_SIZE = 10;

export function BattleArena({
  plan,
  initialContenders,
  initialBuffer,
  initialPage,
  totalPages,
}: {
  plan: SearchPlan;
  /** Already shuffled for draw order (server-side, to match hydration). */
  initialContenders: Contender[];
  initialBuffer: Contender[];
  initialPage: number;
  totalPages: number;
}) {
  const [battle, setBattle] = useState<Battle>(() =>
    startBattle(initialContenders),
  );
  const [buffer, setBuffer] = useState<Contender[]>(initialBuffer);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(totalPages);

  // The counter restarts each round; these track where the current round began
  // (in global matches) and how many matchups it holds.
  const [roundBase, setRoundBase] = useState(0);
  const [roundMatches, setRoundMatches] = useState(
    Math.max(initialContenders.length - 1, 0),
  );

  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const champ = champion(battle);
  const chall = challenger(battle);
  const over = isOver(battle);

  // More rounds are possible while the buffer holds contenders or TMDB has pages
  // left to fetch. When both run dry, the battle is truly over.
  const canLoadMore = buffer.length > 0 || page < pages;

  function pick(winnerId: number) {
    const next = resolveMatch(battle, winnerId);
    if (next === battle) return; // not a valid pick for this matchup

    // Nowhere to persist preference data yet — log the shape at battle end.
    if (isOver(next)) console.log("[battle] history", next.history);
    setBattle(next);
  }

  async function loadMore() {
    setLoadingMore(true);
    setLoadError(false);
    try {
      let buf = buffer;
      let pg = page;
      let tp = pages;

      // Top up the buffer to a full round if TMDB still has pages. One page adds
      // up to 20, so a single fetch clears the threshold; loop only guards the
      // rare short page.
      while (buf.length < ROUND_SIZE && pg < tp) {
        const res = await loadMorePage(plan, pg + 1);
        pg = res.page;
        tp = res.totalPages;
        const seen = new Set([
          ...battle.contenders.map((c) => c.id),
          ...buf.map((c) => c.id),
        ]);
        const fresh = res.contenders.filter((c) => !seen.has(c.id));
        buf = [...buf, ...fresh];
        if (fresh.length === 0) break; // a page with nothing new — stop paging
      }

      // Next round's challengers: the next 10 in relevance order, minus the
      // champion and anyone already defeated, then shuffled for draw order.
      const excluded = new Set([champ.id, ...battle.defeatedIds]);
      const take = buf.slice(0, ROUND_SIZE);
      const challengers = shuffle(take.filter((c) => !excluded.has(c.id)));

      setBuffer(buf.slice(take.length));
      setPage(pg);
      setPages(tp);

      if (challengers.length === 0) return; // nothing left; canLoadMore is now false

      setRoundBase(battle.history.length);
      setRoundMatches(challengers.length);
      setBattle(addContenders(battle, challengers));
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  if (over) {
    return (
      <ChampionScreen
        champ={champ}
        defeated={battle.defeatedIds.length}
        canLoadMore={canLoadMore}
        loadingMore={loadingMore}
        loadError={loadError}
        onMore={loadMore}
      />
    );
  }

  if (!chall) return null;

  const shown = battle.history.length - roundBase + 1;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="flex items-baseline justify-between">
        <Link href="/" className="text-sm underline">
          ← New search
        </Link>
        <span className="font-mono text-sm tabular-nums text-gray-500">
          {pad(shown)} / {pad(roundMatches)}
        </span>
      </div>

      {/* Champion is ALWAYS on the left, even after it changes hands. Cards that
          swap sides make people lose track of which one they were reading. */}
      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-stretch gap-4">
        <Card contender={champ} side="champion" onPick={() => pick(champ.id)} />
        <div className="flex items-center font-mono text-lg font-bold text-gray-400">
          VS
        </div>
        <Card
          contender={chall}
          side="challenger"
          onPick={() => pick(chall.id)}
        />
      </div>

      <p className="mt-4 text-right font-mono text-xs uppercase tracking-widest text-gray-500">
        {battle.defeatedIds.length} defeated
      </p>
    </main>
  );
}

function ChampionScreen({
  champ,
  defeated,
  canLoadMore,
  loadingMore,
  loadError,
  onMore,
}: {
  champ: Contender;
  defeated: number;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadError: boolean;
  onMore: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-red-600">
        Champion
      </p>

      <div className="mt-4 rounded-lg border-2 border-red-500 p-6 text-left">
        <div className="flex gap-5">
          <Poster contender={champ} className="h-56 w-40 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-snug">{champ.title}</p>
            <Meta contender={champ} />
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              {champ.overview || "No overview available."}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-600">
        Defeated {defeated} {defeated === 1 ? "contender" : "contenders"}
      </p>

      <div className="mt-6 flex justify-center gap-3">
        {canLoadMore ? (
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
        <WhereToWatch champ={champ} />
      </div>

      {loadError && (
        <p className="mt-3 text-sm text-red-600">
          Couldn&rsquo;t load more. Try again.
        </p>
      )}

      <Link href="/" className="mt-6 inline-block text-sm underline">
        New search
      </Link>
    </main>
  );
}

function WhereToWatch({ champ }: { champ: Contender }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(false);
  const [providers, setProviders] = useState<WatchProviders | null>(null);

  async function check() {
    setLoading(true);
    setError(false);
    try {
      setProviders(await fetchWatchProviders(champ.id));
      setChecked(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!checked ? (
        <button
          type="button"
          onClick={check}
          disabled={loading}
          className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Checking…" : "Where to watch"}
        </button>
      ) : null}

      {error && (
        <p className="mt-3 w-full text-sm text-red-600">
          Couldn&rsquo;t check providers. Try again.
        </p>
      )}

      {checked && (
        <div className="mt-4 w-full text-left">
          {providers === null ? (
            <p className="text-sm text-gray-600">
              No US streaming, rental, or purchase options are listed for this
              title.
            </p>
          ) : (
            <div className="space-y-3">
              <ProviderRow label="Stream" list={providers.streaming} link={providers.link} />
              <ProviderRow label="Rent" list={providers.rent} link={providers.link} />
              <ProviderRow label="Buy" list={providers.buy} link={providers.link} />
              <a
                href={providers.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs underline"
              >
                More options on TMDB →
              </a>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ProviderRow({
  label,
  list,
  link,
}: {
  label: string;
  list: WatchProvider[];
  link: string;
}) {
  if (list.length === 0) return null;
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-gray-500">
        {label}
      </p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {list.map((p) => (
          <li key={p.providerId}>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              title={p.providerName}
              className="flex items-center gap-2 rounded border border-gray-200 p-1.5"
            >
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.logoUrl}
                  alt={p.providerName}
                  className="h-7 w-7 rounded"
                />
              ) : null}
              <span className="pr-1 text-xs">{p.providerName}</span>
            </a>
          </li>
        ))}
      </ul>
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
      className={`flex flex-col rounded-lg border-2 p-4 text-left ${accent}`}
    >
      <span className={`font-mono text-xs uppercase tracking-widest ${label}`}>
        {side}
      </span>
      <Poster contender={contender} className="mt-3 aspect-[2/3] w-full" />
      <span className="mt-3 font-medium leading-snug">{contender.title}</span>
      <Meta contender={contender} />
      <span className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">
        {contender.overview}
      </span>
    </button>
  );
}

function Meta({ contender }: { contender: Contender }) {
  return (
    <span className="mt-1 flex items-center gap-2 text-sm text-gray-500">
      <span>{contender.year ?? "—"}</span>
      <span aria-hidden>·</span>
      <span className="text-amber-600">★ {contender.rating.toFixed(1)}</span>
    </span>
  );
}

function Poster({
  contender,
  className,
}: {
  contender: Contender;
  className: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={contender.posterUrl ?? ""}
      alt={contender.title}
      className={`rounded bg-gray-100 object-cover ${className}`}
    />
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
