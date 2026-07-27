"use client";

// BATTLE — the interactive half of /battle?q=... in the arcade language.
// One stateful component owns the whole run: the winner-stays bracket, a
// client-side undo stack, early "crown the current leader", the shatter
// animation on each elimination, and the OUT well. It is keyed on the
// refinement signature by the server page, so changing a filter remounts a
// fresh battle. Client state, plus a fire-once save to Supabase when the battle
// ends or is abandoned (see ./use-save-battle) — the bracket logic itself stays
// pure and client-only.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  AppliedChip,
  Contender,
  Facet,
  Refinements,
  SearchPlan,
  WatchProvider,
  WatchProviders,
} from "@/lib/types";
import {
  type Battle,
  MIN_CONTENDERS,
  addContenders,
  challenger,
  champion,
  isOver,
  resolveMatch,
  shuffle,
  startBattle,
} from "@/lib/battle";
import { RefinePanel } from "./refine";
import { loadMorePage, fetchWatchProviders } from "./actions";
import { useSaveBattle } from "./use-save-battle";
import { Logo } from "../components/Logo";
import { Overlay } from "../components/Overlay";

const ROUND_SIZE = 10;

// Tile palette for eliminated contenders (OUT well) and shatter shards, keyed
// by a contender's position in the running pool so a film keeps one colour.
const PALETTE = ["#4a90c2", "#6aa84f", "#9a6b3f", "#8c8f94", "#d4a437", "#b3423f"];

/** A full snapshot of the run, pushed before each move so UNDO can restore it. */
type Snap = {
  battle: Battle;
  buffer: Contender[];
  page: number;
  pages: number;
  roundBase: number;
  roundMatches: number;
  rounds: number;
  crowned: boolean;
};

type Side = "champion" | "challenger";

export function BattleScreen({
  query,
  plan,
  refinements,
  facets,
  applied,
  initialContenders,
  initialBuffer,
  initialPage,
  totalPages,
}: {
  query: string;
  plan: SearchPlan;
  refinements: Refinements;
  facets: Facet[];
  applied: AppliedChip[];
  initialContenders: Contender[];
  initialBuffer: Contender[];
  initialPage: number;
  totalPages: number;
}) {
  const router = useRouter();

  const pool = [...initialContenders, ...initialBuffer];
  const runnable = pool.length >= MIN_CONTENDERS;

  const [battle, setBattle] = useState<Battle>(() =>
    startBattle(initialContenders),
  );
  const [buffer, setBuffer] = useState<Contender[]>(initialBuffer);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(totalPages);

  // Counter restarts each round; these anchor where the current round began.
  const [roundBase, setRoundBase] = useState(0);
  const [roundMatches, setRoundMatches] = useState(
    Math.max(initialContenders.length - 1, 0),
  );
  // Rounds played: starts at 1, +1 each time "More contenders" adds a batch.
  const [rounds, setRounds] = useState(1);

  const [past, setPast] = useState<Snap[]>([]);
  const [shatter, setShatter] = useState<{ side: Side; color: string } | null>(null);
  const [crowned, setCrowned] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const champ = champion(battle);
  const chall = challenger(battle);
  const over = isOver(battle) || crowned;
  const canLoadMore = buffer.length > 0 || page < pages;

  // Persist this battle when it ends or is abandoned (≥1 matchup). Anonymous for
  // now — auth is off, so no user_id; the per-browser session id is what lets us
  // claim these rows once login ships. Reads the loop's own history; the bracket
  // logic in lib/battle.ts is untouched.
  useSaveBattle(over, {
    arena: "movies",
    prompt: query,
    resolvedQuery: plan,
    appliedRefinements: applied,
    championTmdbId: champ?.id ?? null,
    initialChampionId: battle.contenders[0]?.id ?? null,
    rounds,
    history: battle.history,
  });

  const colorFor = (id: number) => {
    const i = battle.contenders.findIndex((c) => c.id === id);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  };

  function snapshot(): Snap {
    return { battle, buffer, page, pages, roundBase, roundMatches, rounds, crowned };
  }

  function pick(side: Side) {
    if (shatter || over || !chall) return;
    const winner = side === "champion" ? champ : chall;
    const loser = side === "champion" ? chall : champ;
    const before = snapshot();
    // The LOSING card shatters, then the match resolves and the next steps up.
    setShatter({
      side: side === "champion" ? "challenger" : "champion",
      color: colorFor(loser.id),
    });
    setTimeout(() => {
      setShatter(null);
      setPast((p) => [...p, before]);
      setBattle(resolveMatch(battle, winner.id));
    }, 400);
  }

  function undo() {
    if (shatter) return;
    if (!past.length) {
      router.push("/");
      return;
    }
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setBattle(prev.battle);
    setBuffer(prev.buffer);
    setPage(prev.page);
    setPages(prev.pages);
    setRoundBase(prev.roundBase);
    setRoundMatches(prev.roundMatches);
    setRounds(prev.rounds);
    setCrowned(prev.crowned);
  }

  function crown() {
    if (over) return;
    setPast((p) => [...p, snapshot()]);
    setCrowned(true);
  }

  async function loadMore() {
    setLoadingMore(true);
    setLoadError(false);
    try {
      let buf = buffer;
      let pg = page;
      let tp = pages;

      // Top up the buffer to a full round if TMDB still has pages.
      while (buf.length < ROUND_SIZE && pg < tp) {
        const res = await loadMorePage(plan, refinements, pg + 1);
        pg = res.page;
        tp = res.totalPages;
        const seen = new Set([
          ...battle.contenders.map((c) => c.id),
          ...buf.map((c) => c.id),
        ]);
        const fresh = res.contenders.filter((c) => !seen.has(c.id));
        buf = [...buf, ...fresh];
        if (fresh.length === 0) break;
      }

      const excluded = new Set([champ.id, ...battle.defeatedIds]);
      const take = buf.slice(0, ROUND_SIZE);
      const challengers = shuffle(take.filter((c) => !excluded.has(c.id)));
      const before = snapshot();

      setBuffer(buf.slice(take.length));
      setPage(pg);
      setPages(tp);

      if (challengers.length === 0) return; // nothing new — stay crowned

      setPast((p) => [...p, before]);
      setRoundBase(battle.history.length);
      setRoundMatches(challengers.length);
      setRounds((r) => r + 1);
      setBattle(addContenders(battle, challengers));
      setCrowned(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Keyboard: arrows pick, Backspace undoes. A ref keeps the listener bound to
  // the latest closures without re-subscribing every render. pick/undo guard
  // their own preconditions (shatter in flight, run over), so onKey just routes.
  const handlers = useRef({ pick, undo });
  useEffect(() => {
    handlers.current = { pick, undo };
  });
  useEffect(() => {
    if (!runnable) return;
    function onKey(e: KeyboardEvent) {
      const h = handlers.current;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        h.pick("champion");
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        h.pick("challenger");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        h.undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runnable]);

  // --- Derived display strings ---
  const streak = streakOf(battle, champ);
  const shown = battle.history.length - roundBase + 1;
  const roundLine = over
    ? `RUN COMPLETE · ${battle.defeatedIds.length} ELIMINATED`
    : `MATCH ${pad(Math.min(shown, roundMatches))} / ${pad(roundMatches)} · PICK ONE TO KEEP`;
  const queryLine = [
    "FILM",
    query,
    ...applied.map((a) => a.label),
  ]
    .join(" · ")
    .toUpperCase();

  return (
    <main
      className="relative box-border flex min-h-0 flex-1 flex-col"
      style={{
        padding: "clamp(12px,2vw,24px) clamp(12px,3vw,44px) clamp(28px,3vw,40px)",
        animation: "bcin .25s ease-out",
      }}
    >
      {/* Header */}
      <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-[10px]">
        <Link
          href="/"
          className="inline-flex items-center gap-[9px] transition-opacity hover:opacity-80"
        >
          <Logo />
          <span
            className="bc-pixel"
            style={{ color: "#f2f4f6", font: "700 clamp(11px,1.3vw,16px) var(--font-silkscreen)", letterSpacing: ".8px" }}
          >
            BATTLECADIA
          </span>
        </Link>
        <div className="flex items-center gap-[7px]">
          <HeaderBtn onClick={undo}>{past.length ? "UNDO" : "← BACK"}</HeaderBtn>
          <button
            type="button"
            onClick={() => setRefineOpen((o) => !o)}
            className="bc-mono cursor-pointer border"
            style={{
              padding: "8px 11px",
              font: "500 clamp(9px,.95vw,12px) var(--font-dm-mono)",
              letterSpacing: "1.2px",
              borderColor: "rgba(42,212,224,.5)",
              background: refineOpen ? "rgba(42,212,224,.22)" : "rgba(42,212,224,.06)",
              color: refineOpen ? "#7ee9f1" : "#2ad4e0",
            }}
          >
            REFINE
          </button>
          <HeaderBtn onClick={() => router.push("/")}>RESTART ↻</HeaderBtn>
        </div>
      </div>

      {/* Query · mode · round line */}
      <div
        className="bc-mono mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[#5a626b]"
        style={{ margin: "clamp(8px,1vw,14px) auto 0", font: "400 clamp(9px,.95vw,12px) var(--font-dm-mono)", letterSpacing: "1.2px" }}
      >
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{queryLine}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ModeToggle />
          <span className="whitespace-nowrap text-[#7f8b98]">{roundLine}</span>
        </div>
      </div>

      {/* Content region. REFINE opens as a modal overlay (see components/Overlay)
          on top of the battle — it never shifts or resizes the cards. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {refineOpen && (
          <Overlay title="REFINE" onClose={() => setRefineOpen(false)} maxWidth={640}>
            <RefinePanel
              query={query}
              refinements={refinements}
              facets={facets}
              applied={applied}
            />
          </Overlay>
        )}

        {!runnable ? (
          <div className="mx-auto mt-12 max-w-[600px] text-center">
            <h2
              className="bc-pixel text-[#f2f4f6]"
              style={{ fontSize: "clamp(13px,1.6vw,20px)", letterSpacing: ".5px" }}
            >
              ONLY {pool.length} {pool.length === 1 ? "FILM" : "FILMS"} MATCH
            </h2>
            <p className="bc-mono mt-3 text-sm text-[#8d949c]">
              Open REFINE and remove a filter to widen the pool.
            </p>
          </div>
        ) : (
          // The OUT well spans this whole row; the cards + I'M DONE bar stack in
          // the right column, so the crown bar starts at the well's right edge
          // and bottoms out exactly where the well does.
          <div
            className="mx-auto flex w-full max-w-[1500px] flex-1"
            style={{ minHeight: "min(420px,50vh)", margin: "clamp(10px,1.4vw,18px) auto 0", gap: "clamp(8px,1.2vw,16px)" }}
          >
            <OutWell battle={battle} colorFor={colorFor} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ gap: "clamp(10px,1.4vw,18px)" }}>
              {over ? (
                <ChampionView
                  champ={champ}
                  defeated={battle.defeatedIds.length}
                  brandColor={colorFor(champ.id)}
                  canLoadMore={canLoadMore}
                  loadingMore={loadingMore}
                  loadError={loadError}
                  onMore={loadMore}
                  onReplay={() => router.push("/")}
                />
              ) : (
                chall && (
                  <>
                    <BattleGrid
                      champ={champ}
                      chall={chall}
                      streak={streak}
                      shatter={shatter}
                      onPick={pick}
                    />
                    <div
                      onClick={crown}
                      className="bc-mono flex-none cursor-pointer border border-[rgba(106,168,79,.5)] bg-[rgba(106,168,79,.14)] text-center text-[#8fd06e] transition-colors hover:bg-[rgba(106,168,79,.24)]"
                      style={{ padding: "clamp(11px,1.3vw,17px) 12px", font: "500 clamp(10px,1.05vw,14px) var(--font-dm-mono)", letterSpacing: "1.6px" }}
                    >
                      I&apos;M DONE — CROWN CURRENT LEADER
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/** Trailing win streak of the current champion (consecutive latest wins). */
function streakOf(battle: Battle, champ: Contender | undefined): number {
  if (!champ) return 0;
  let s = 0;
  for (let i = battle.history.length - 1; i >= 0; i--) {
    if (battle.history[i].winnerId === champ.id) s++;
    else break;
  }
  return s;
}

function HeaderBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bc-mono cursor-pointer border border-white/[.16] bg-white/[.05] text-[#cfd6de] transition-colors hover:bg-white/[.12]"
      style={{ padding: "8px 11px", font: "500 clamp(9px,.95vw,12px) var(--font-dm-mono)", letterSpacing: "1.2px" }}
    >
      {children}
    </button>
  );
}

/** Format selector shown next to the round counter. Winner-stays is the live
 *  format; knockout rounds are designed but not built yet, so it reads SOON. */
function ModeToggle() {
  return (
    <div className="flex items-center gap-[7px]">
      <span className="bc-pixel text-[#5a626b]" style={{ fontSize: "clamp(7px,.75vw,9px)", letterSpacing: ".5px" }}>
        MODE
      </span>
      <div className="flex gap-[3px]">
        <span
          className="bc-mono"
          style={{
            padding: "5px 9px",
            font: "500 clamp(8px,.9vw,11px) var(--font-dm-mono)",
            letterSpacing: ".6px",
            border: "1px solid rgba(42,212,224,.5)",
            background: "rgba(42,212,224,.16)",
            color: "#7ee9f1",
          }}
        >
          WINNER STAYS
        </span>
        <span
          className="bc-mono inline-flex cursor-not-allowed items-center gap-[5px]"
          title="Knockout rounds — coming soon"
          style={{
            padding: "5px 9px",
            font: "500 clamp(8px,.9vw,11px) var(--font-dm-mono)",
            letterSpacing: ".6px",
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.03)",
            color: "#5a626b",
          }}
        >
          KNOCKOUT
          <span className="bc-pixel" style={{ fontSize: "7px", letterSpacing: ".5px", background: "rgba(0,0,0,.4)", padding: "1px 3px", color: "#8d949c" }}>
            SOON
          </span>
        </span>
      </div>
    </div>
  );
}

// --- OUT well ---------------------------------------------------------------

function OutWell({
  battle,
  colorFor,
}: {
  battle: Battle;
  colorFor: (id: number) => string;
}) {
  const recent = battle.defeatedIds.slice(-9); // newest nine
  const byId = new Map(battle.contenders.map((c) => [c.id, c]));

  return (
    <div className="flex flex-none flex-col" style={{ width: "clamp(38px,5vw,104px)" }}>
      <div className="bc-pixel pb-[6px] text-center text-[#7f8b98]" style={{ fontSize: "clamp(8px,.85vw,11px)" }}>
        OUT
      </div>
      <div className="flex flex-1 flex-col-reverse gap-[3px] border border-white/[.14] bg-white/[.03] p-[3px] box-border">
        {Array.from({ length: 9 }).map((_, i) => {
          const id = recent[i];
          if (id === undefined) {
            return (
              <div
                key={i}
                className="flex flex-1 items-center justify-center border box-border"
                style={{ background: "rgba(255,255,255,.03)", borderColor: "rgba(255,255,255,.09)", color: "transparent" }}
              >
                ·
              </div>
            );
          }
          const film = byId.get(id);
          const drop = i === recent.length - 1 ? "bcdrop .3s ease-out" : "none";
          return (
            <div
              key={i}
              className="bc-pixel relative flex flex-1 items-center justify-center overflow-hidden border box-border"
              title={film?.title}
              style={{
                background: colorFor(id),
                borderColor: "rgba(0,0,0,.45)",
                color: "rgba(0,0,0,.6)",
                font: "400 clamp(7px,.9vw,12px) var(--font-silkscreen)",
                animation: drop,
              }}
            >
              {film?.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={film.posterUrl}
                  alt={film.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ filter: "grayscale(.3)" }}
                />
              ) : (
                (film?.title ?? "").slice(0, 2).toUpperCase()
              )}
            </div>
          );
        })}
      </div>
      <div className="bc-pixel pt-[6px] text-center text-[#7f8b98]" style={{ fontSize: "clamp(8px,.85vw,11px)" }}>
        {battle.defeatedIds.length}
      </div>
    </div>
  );
}

// --- Battle grid ------------------------------------------------------------

function BattleGrid({
  champ,
  chall,
  streak,
  shatter,
  onPick,
}: {
  champ: Contender;
  chall: Contender;
  streak: number;
  shatter: { side: Side; color: string } | null;
  onPick: (side: Side) => void;
}) {
  return (
    <div
      className="relative grid min-h-0 min-w-0 flex-1"
      style={{
        gridTemplateColumns: "repeat(auto-fit,minmax(min(330px,100%),1fr))",
        gridAutoRows: "minmax(0,1fr)",
        gap: "clamp(10px,1.5vw,20px)",
      }}
    >
      <BattleCard
        contender={champ}
        badge={`CHAMPION · ${streak > 0 ? `${streak} WIN${streak === 1 ? "" : "S"}` : "NEW"}`}
        badgeBg="#6aa84f"
        badgeFg="#0e2409"
        shatter={shatter?.side === "champion" ? shatter.color : null}
        onPick={() => onPick("champion")}
      />
      <BattleCard
        contender={chall}
        badge="CHALLENGER"
        badgeBg="#b3423f"
        badgeFg="#ffffff"
        shatter={shatter?.side === "challenger" ? shatter.color : null}
        onPick={() => onPick("challenger")}
      />
      {/* VS badge */}
      <div
        className="bc-pixel pointer-events-none absolute left-1/2 top-1/2 z-[3] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-[#f2f4f6] text-[#08090c]"
        style={{ width: "clamp(34px,4vw,52px)", height: "clamp(34px,4vw,52px)", boxShadow: "0 0 0 4px #08090c", font: "700 clamp(10px,1.1vw,15px) var(--font-silkscreen)" }}
      >
        VS
      </div>
    </div>
  );
}

function BattleCard({
  contender,
  badge,
  badgeBg,
  badgeFg,
  shatter,
  onPick,
}: {
  contender: Contender;
  badge: string;
  badgeBg: string;
  badgeFg: string;
  shatter: string | null;
  onPick: () => void;
}) {
  return (
    <div
      onClick={onPick}
      className="bc-panel bc-lift relative flex min-h-0 cursor-pointer flex-col overflow-hidden"
    >
      <div
        className="bc-inset relative flex min-h-0 flex-1 items-center justify-center"
        style={{ borderBottom: "4px solid #14161a" }}
      >
        {contender.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={contender.posterUrl} alt={contender.title} className="h-full w-full object-contain" />
        ) : (
          <span className="bc-pixel text-[#5a626b]" style={{ fontSize: "clamp(8px,.9vw,11px)" }}>
            NO IMAGE
          </span>
        )}
        <div className="bc-pixel absolute left-0 top-0" style={{ padding: "5px 9px", background: badgeBg, color: badgeFg, fontSize: "clamp(8px,.9vw,11px)" }}>
          {badge}
        </div>
        <div className="bc-mono absolute right-0 top-0 bg-[rgba(8,9,12,.8)] text-[#f2f4f6]" style={{ padding: "5px 9px", font: "500 clamp(12px,1.4vw,18px) var(--font-dm-mono)" }}>
          ★ {contender.rating.toFixed(1)}
        </div>
      </div>
      <div className="flex flex-none flex-col gap-[5px]" style={{ padding: "clamp(9px,1.1vw,15px) clamp(11px,1.3vw,18px)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
          <span className="bc-mono text-[#f2f4f6]" style={{ font: "500 clamp(17px,2vw,28px) var(--font-dm-mono)" }}>
            {contender.title}
          </span>
          <span className="bc-pixel text-[#8d949c]" style={{ fontSize: "clamp(9px,.95vw,12px)" }}>
            {contender.year ?? "—"}
          </span>
        </div>
        <div className="bc-mono text-[#8d949c]" style={{ font: "400 clamp(10px,1.05vw,14px) var(--font-dm-mono)" }}>
          {contender.voteCount.toLocaleString()} votes
        </div>
        {contender.overview && (
          <div
            className="bc-mono text-[#2ad4e0]"
            style={{ font: "400 clamp(10px,1.05vw,14px)/1.45 var(--font-dm-mono)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {contender.overview}
          </div>
        )}
      </div>
      {shatter && <Shatter color={shatter} />}
    </div>
  );
}

/** Nine shards flung off the losing card. */
function Shatter({ color }: { color: string }) {
  const cells = [
    { l: "0", t: "0", a: "bcs1" },
    { l: "33.3%", t: "0", a: "bcs2" },
    { l: "66.6%", t: "0", a: "bcs3" },
    { l: "0", t: "33.3%", a: "bcs4" },
    { l: "33.3%", t: "33.3%", a: "bcs5" },
    { l: "66.6%", t: "33.3%", a: "bcs6" },
    { l: "0", t: "66.6%", a: "bcs7" },
    { l: "33.3%", t: "66.6%", a: "bcs8" },
    { l: "66.6%", t: "66.6%", a: "bcs9" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0" style={{ color }}>
      {cells.map((c) => (
        <div
          key={c.a}
          className="absolute"
          style={{ left: c.l, top: c.t, width: "33.4%", height: "33.4%", background: "currentColor", animation: `${c.a} .4s ease-out forwards` }}
        />
      ))}
    </div>
  );
}

// --- Champion ---------------------------------------------------------------

function ChampionView({
  champ,
  defeated,
  brandColor,
  canLoadMore,
  loadingMore,
  loadError,
  onMore,
  onReplay,
}: {
  champ: Contender;
  defeated: number;
  brandColor: string;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadError: boolean;
  onMore: () => void;
  onReplay: () => void;
}) {
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState(false);
  const [checked, setChecked] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [providers, setProviders] = useState<WatchProviders | null>(null);

  async function whereToWatch() {
    // Already fetched once — just reopen the overlay, no refetch.
    if (checked) {
      setWatchOpen(true);
      return;
    }
    setWatchLoading(true);
    setWatchError(false);
    try {
      setProviders(await fetchWatchProviders(champ.id));
      setChecked(true);
      setWatchOpen(true);
    } catch {
      setWatchError(true);
    } finally {
      setWatchLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ gap: "clamp(8px,1.1vw,14px)", animation: "bccrown .3s ease-out" }}>
      {/* Banner */}
      <div
        className="bc-pixel flex-none text-center text-[#0e2409]"
        style={{
          padding: "clamp(9px,1.1vw,15px) 0",
          background: "#6aa84f",
          borderTop: "4px solid rgba(255,255,255,.34)",
          borderLeft: "4px solid rgba(255,255,255,.2)",
          borderRight: "4px solid rgba(0,0,0,.3)",
          borderBottom: "4px solid rgba(0,0,0,.44)",
          font: "400 clamp(12px,1.5vw,20px) var(--font-silkscreen)",
          letterSpacing: ".5px",
        }}
      >
        CHAMPION
      </div>

      {/* Champion card */}
      <div
        className="bc-panel grid min-h-0 flex-1 items-stretch"
        style={{ padding: "clamp(12px,1.6vw,24px)", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gridAutoRows: "minmax(0,1fr)", gap: "clamp(12px,2vw,28px)" }}
      >
        <div className="bc-inset flex min-h-0 items-center justify-center" style={{ border: "4px solid #14161a" }}>
          {champ.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={champ.posterUrl} alt={champ.title} className="h-full w-full object-cover" />
          ) : (
            <span className="bc-pixel text-[#5a626b]" style={{ fontSize: "clamp(8px,.9vw,11px)" }}>
              NO IMAGE
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-col justify-center" style={{ gap: "clamp(6px,.9vw,12px)" }}>
          <div className="bc-pixel" style={{ color: brandColor, fontSize: "clamp(9px,1vw,13px)" }}>
            {champ.year ?? "—"}
          </div>
          <div className="bc-mono text-[#f2f4f6]" style={{ font: "500 clamp(21px,3vw,44px)/1.05 var(--font-dm-mono)" }}>
            {champ.title}
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="bc-mono text-[#f2f4f6]" style={{ font: "500 clamp(19px,2.2vw,32px) var(--font-dm-mono)" }}>
              ★ {champ.rating.toFixed(1)}
            </span>
            <span className="bc-mono text-[#8d949c]" style={{ font: "400 clamp(10px,1.05vw,14px) var(--font-dm-mono)" }}>
              {champ.voteCount.toLocaleString()} votes
            </span>
          </div>
          {champ.overview && (
            <p className="bc-mono text-[#8d949c]" style={{ font: "400 clamp(10px,1.05vw,14px)/1.5 var(--font-dm-mono)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {champ.overview}
            </p>
          )}
          <div className="bc-mono text-[#6aa84f]" style={{ font: "400 clamp(10px,1.05vw,14px) var(--font-dm-mono)", letterSpacing: "1.2px" }}>
            DEFEATED {defeated} {defeated === 1 ? "CONTENDER" : "CONTENDERS"}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-none flex-wrap items-stretch gap-[9px]">
        <button
          type="button"
          onClick={whereToWatch}
          disabled={watchLoading}
          className="bc-cta bc-pixel flex-[1_1_220px] text-center text-[#0e2409] disabled:opacity-60"
          style={{ padding: "clamp(14px,1.6vw,22px) 12px", font: "400 clamp(13px,1.4vw,19px) var(--font-silkscreen)" }}
        >
          {watchLoading ? "CHECKING…" : "WHERE TO WATCH"}
        </button>
        {canLoadMore && (
          <button
            type="button"
            onClick={onMore}
            disabled={loadingMore}
            className="bc-mono flex items-center justify-center border border-white/[.18] bg-white/[.05] text-[#cfd6de] transition-colors hover:bg-white/[.12] disabled:opacity-50"
            style={{ padding: "clamp(14px,1.6vw,22px) clamp(14px,2vw,28px)", font: "500 clamp(10px,1.05vw,14px) var(--font-dm-mono)", letterSpacing: "1.4px" }}
          >
            {loadingMore ? "FINDING…" : "MORE CONTENDERS"}
          </button>
        )}
        <button
          type="button"
          onClick={onReplay}
          className="bc-mono flex items-center justify-center border border-white/[.18] bg-white/[.05] text-[#cfd6de] transition-colors hover:bg-white/[.12]"
          style={{ padding: "clamp(14px,1.6vw,22px) clamp(14px,2vw,28px)", font: "500 clamp(10px,1.05vw,14px) var(--font-dm-mono)", letterSpacing: "1.4px" }}
        >
          REPLAY
        </button>
      </div>

      {loadError && (
        <p className="bc-mono flex-none text-sm text-[#b3423f]">Couldn&rsquo;t load more. Try again.</p>
      )}
      {watchError && (
        <p className="bc-mono flex-none text-sm text-[#b3423f]">Couldn&rsquo;t check providers. Try again.</p>
      )}

      {/* Where-to-watch opens as a modal overlay ON TOP of the champion card —
          closing it (backdrop, ✕, or Esc) leaves the champion screen intact. */}
      {watchOpen && (
        <Overlay
          title={`WHERE TO WATCH · ${champ.title.toUpperCase()}`}
          onClose={() => setWatchOpen(false)}
          maxWidth={520}
        >
          {providers === null ? (
            <p className="bc-mono text-[#2ad4e0]" style={{ font: "400 clamp(9px,1vw,13px)/1.5 var(--font-dm-mono)", letterSpacing: "1px" }}>
              NO US STREAMING, RENTAL, OR PURCHASE OPTIONS ARE LISTED FOR THIS TITLE.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <ProviderRow label="STREAM" list={providers.streaming} link={providers.link} />
              <ProviderRow label="RENT" list={providers.rent} link={providers.link} />
              <ProviderRow label="BUY" list={providers.buy} link={providers.link} />
              <a href={providers.link} target="_blank" rel="noopener noreferrer" className="bc-mono text-xs text-[#2ad4e0] underline">
                More options on TMDB →
              </a>
            </div>
          )}
        </Overlay>
      )}
    </div>
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
      <p className="bc-pixel text-[#7f8b98]" style={{ fontSize: "clamp(8px,.85vw,11px)", letterSpacing: "1px" }}>
        {label}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {list.map((p) => (
          <li key={p.providerId}>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              title={p.providerName}
              className="flex items-center gap-2 border border-white/[.16] bg-white/[.04] p-[6px]"
            >
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logoUrl} alt={p.providerName} className="h-7 w-7" />
              ) : null}
              <span className="bc-mono pr-1 text-xs text-[#cfd6de]">{p.providerName}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
