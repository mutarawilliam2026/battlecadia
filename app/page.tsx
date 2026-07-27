"use client";

// INTENT SCREEN — /
// "Choose your arena." A fill-in-the-blank of what you want to watch (item /
// mood / era, all folded into one natural-language prompt for Gemini) plus the
// arena wheel. Only the FILM arena is wired to a backend today; the other five
// render as designed but sit locked ("SOON"). Submitting navigates to
// /battle?q=… — the prompt lives in the URL, no POST, no stored id.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "./components/Logo";

// The six arenas, positioned/rotated exactly as the design lays them around the
// hub. `live` marks the one with a real backend; the rest are locked.
type Arena = {
  key: string;
  label: string;
  bg: string;
  fg: string;
  rot: number;
  left: string;
  top: string;
  live?: boolean;
};
const ARENAS: Arena[] = [
  { key: "shop", label: "SHOP", bg: "#9a6b3f", fg: "#ffffff", rot: -8, left: "37.33%", top: "0.67%" },
  { key: "food", label: "FOOD", bg: "#6aa84f", fg: "#0e2409", rot: 7, left: "69%", top: "19%" },
  { key: "film", label: "MOVIES", bg: "#4a90c2", fg: "#08202e", rot: -6, left: "69%", top: "55.67%", live: true },
  { key: "books", label: "BOOKS", bg: "#8c8f94", fg: "#1b1d20", rot: 9, left: "37.33%", top: "74%" },
  { key: "travel", label: "TRAVEL", bg: "#d4a437", fg: "#2c2005", rot: 6, left: "5.67%", top: "55.67%" },
  { key: "music", label: "MUSIC", bg: "#b3423f", fg: "#2d0a09", rot: -9, left: "5.67%", top: "19%" },
];

// Prompt starters — clicking one fills the first blank.
const SUGGESTIONS = [
  { label: "A TENSE THRILLER", value: "a tense thriller" },
  { label: "FEEL-GOOD ANIMATION", value: "a feel-good animation" },
  { label: "80s HORROR", value: "a scary movie from the 80s" },
];

export default function Intent() {
  const router = useRouter();
  const [f, setF] = useState({ item: "", vibe: "", era: "" });
  // Gemini + TMDB take a couple of seconds; `busy` drives the button's spinner
  // and blocks a second submit so one tap can't fire two searches.
  const [busy, setBusy] = useState(false);

  const ready = f.item.trim().length > 0;

  function start() {
    if (!ready || busy) return;
    const q = [f.item, f.vibe, f.era]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
    setBusy(true);
    router.push(`/battle?q=${encodeURIComponent(q)}`);
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      start();
    }
  }

  return (
    <main
      className="flex flex-1 flex-col box-border"
      style={{
        padding:
          "clamp(16px,2.6vw,30px) clamp(16px,4vw,60px) clamp(20px,3vw,44px)",
        animation: "bcin .25s ease-out",
      }}
    >
      {/* Header */}
      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-[10px] transition-opacity hover:opacity-80"
        >
          <Logo />
          <span
            className="bc-pixel"
            style={{ color: "#f2f4f6", font: "700 clamp(12px,1.5vw,18px) var(--font-silkscreen)", letterSpacing: ".8px" }}
          >
            BATTLECADIA
          </span>
        </Link>
        <AuthButtons />
      </div>

      {/* Centre stage: copy + form on the left, arena wheel on the right */}
      <div className="flex flex-1 items-center justify-center" style={{ padding: "clamp(16px,3.5vh,56px) 0" }}>
        <div className="flex w-full max-w-[1240px] flex-wrap items-center justify-center" style={{ gap: "clamp(22px,4vw,80px)" }}>
          {/* Left column */}
          <div className="flex min-w-[300px] flex-1 flex-col" style={{ gap: "clamp(16px,2.2vw,28px)" }}>
            <div>
              <h1
                className="bc-mono m-0 uppercase text-[#f2f4f6]"
                style={{
                  font: "500 clamp(28px,4.4vw,58px)/1.02 var(--font-dm-mono)",
                  letterSpacing: "-1px",
                  wordSpacing: "-.16em",
                  textWrap: "balance",
                }}
              >
                Choose your arena
              </h1>
              <p
                className="bc-mono max-w-[44ch] text-[#8d949c]"
                style={{ margin: "clamp(8px,1vw,14px) 0 0", font: "400 clamp(12px,1.25vw,17px)/1.5 var(--font-dm-mono)" }}
              >
                Eliminate decision paralysis. A battle at a time.
              </p>
            </div>

            {/* Fill-in-the-blank + green play button */}
            <div
              className="box-border flex items-end border border-white/[.18] bg-white/[.04]"
              style={{
                padding: "clamp(12px,1.6vw,20px) clamp(11px,1.4vw,18px)",
                gap: "clamp(10px,1.4vw,18px)",
              }}
            >
              <div className="flex min-w-0 flex-1 flex-col" style={{ gap: "clamp(10px,1.2vw,15px)" }}>
                <Blank prefix="I want" k="item" value={f.item} placeholder="a tense thriller" setF={setF} onEnter={onEnter} grow />
                <Blank prefix="vibe" k="vibe" value={f.vibe} placeholder="edge-of-seat" setF={setF} onEnter={onEnter} grow />
                <Blank prefix="era" k="era" value={f.era} placeholder="the 80s" setF={setF} onEnter={onEnter} grow />
              </div>
              <button
                type="button"
                onClick={start}
                disabled={busy}
                aria-label={busy ? "Starting battle" : "Start battle"}
                aria-busy={busy}
                className="bc-cta flex flex-none items-center justify-center"
                style={{
                  width: "clamp(54px,5vw,68px)",
                  height: "clamp(54px,5vw,68px)",
                  opacity: busy ? 0.85 : ready ? 1 : 0.42,
                  cursor: busy ? "wait" : ready ? "pointer" : "not-allowed",
                }}
              >
                {busy ? (
                  <span
                    aria-hidden
                    style={{
                      width: "clamp(18px,1.8vw,22px)",
                      height: "clamp(18px,1.8vw,22px)",
                      border: "3px solid rgba(14,36,9,.28)",
                      borderTopColor: "#0e2409",
                      borderRadius: "50%",
                      animation: "bcspin .7s linear infinite",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "14px solid #0e2409",
                      borderTop: "9px solid transparent",
                      borderBottom: "9px solid transparent",
                      marginLeft: 3,
                    }}
                  />
                )}
              </button>
            </div>

            {/* Prompt starters */}
            <div className="flex flex-wrap gap-[7px]">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setF((cur) => ({ ...cur, item: s.value }))}
                  className="bc-mono cursor-pointer border border-white/[.16] bg-white/[.07] text-[#cfd6de] transition-colors hover:bg-white/[.14]"
                  style={{ padding: "8px 11px", font: "400 clamp(10px,1vw,12px) var(--font-dm-mono)", letterSpacing: ".3px" }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {(busy || ready) && (
              <div
                className="bc-mono text-[#5a626b]"
                style={{ font: "400 clamp(9px,.95vw,12px) var(--font-dm-mono)", letterSpacing: "1.4px" }}
              >
                {busy
                  ? "SEARCHING — BUILDING YOUR ARENA…"
                  : "READY — ONE CHAMPION, MANY MATCHES"}
              </div>
            )}
          </div>

          {/* Right column: the arena wheel */}
          <div className="flex min-w-[300px] flex-1 justify-center">
            <div className="relative aspect-square" style={{ width: "min(100%, 480px, max(40vh, 34vw))" }}>
              {/* Dotted orbit ring */}
              <div
                className="absolute rounded-full border-[3px] border-dotted border-white/10"
                style={{ left: "11.33%", top: "11.33%", width: "77.33%", height: "77.33%", animation: "bcspin 60s linear infinite" }}
              />
              {/* Hub — the selected arena. Movies is the live one, marked with a
                  film-reel glyph so it reads as more than just a word. */}
              <div
                className="bc-hub absolute flex flex-col items-center justify-center text-center"
                style={{ left: "34%", top: "34%", width: "32%", height: "32%", gap: "clamp(5px,.8vw,9px)" }}
              >
                <FilmReel />
                <div
                  className="bc-mono uppercase text-[#f2f4f6]"
                  style={{ font: "500 clamp(12px,1.4vw,17px) var(--font-dm-mono)", letterSpacing: "-.5px" }}
                >
                  Movies
                </div>
                <div className="bc-pixel text-[#6aa84f]" style={{ fontSize: "clamp(8px,.85vw,10px)" }}>
                  SELECTED
                </div>
              </div>
              {/* White selection cursor, locked over the FILM tile */}
              <div
                className="pointer-events-none absolute border-[3px] border-[#f2f4f6]"
                style={{
                  left: "66.33%",
                  top: "53%",
                  width: "30.67%",
                  height: "30.67%",
                  transform: "rotate(-6deg)",
                  boxShadow: "0 0 0 3px rgba(0,0,0,.55)",
                }}
              />
              {/* The six arena tiles */}
              {ARENAS.map((a) => (
                <div
                  key={a.key}
                  onClick={a.live ? start : undefined}
                  className={`bc-tile absolute flex items-center justify-center ${a.live ? "bc-lift cursor-pointer" : "cursor-not-allowed"}`}
                  style={{
                    left: a.left,
                    top: a.top,
                    width: "25.33%",
                    height: "25.33%",
                    transform: `rotate(${a.rot}deg)`,
                    background: a.bg,
                    opacity: a.live ? 1 : 0.5,
                  }}
                >
                  <span className="bc-pixel" style={{ color: a.fg, font: "400 clamp(9px,1.05vw,13px) var(--font-silkscreen)" }}>
                    {a.label}
                  </span>
                  {!a.live && (
                    <span
                      className="bc-pixel absolute bottom-1 right-1 bg-black/40 px-1 py-[1px] text-[#f2f4f6]"
                      style={{ fontSize: "7px", letterSpacing: ".5px" }}
                    >
                      SOON
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Film-reel glyph for the selected (Movies) arena hub — a ring with the six
 *  perforations, drawn in the cyan accent. Purely decorative. */
function FilmReel() {
  const holes: [number, number][] = [
    [16, 6.5],
    [16, 25.5],
    [7.77, 11.25],
    [24.23, 11.25],
    [7.77, 20.75],
    [24.23, 20.75],
  ];
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      style={{ width: "clamp(26px,3vw,38px)", height: "clamp(26px,3vw,38px)" }}
    >
      <circle cx="16" cy="16" r="13" stroke="#2ad4e0" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="3.1" fill="#2ad4e0" />
      {holes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" fill="#2ad4e0" />
      ))}
    </svg>
  );
}

/** Sign-in / sign-up — designed and in the layout, but disabled until the auth
 *  slice ships. Everyone plays anonymously for now, so these read SOON. */
function AuthButtons() {
  const pill =
    "bc-mono cursor-not-allowed border border-white/[.16] bg-white/[.05] text-[#8d949c]";
  const pillStyle = {
    padding: "7px 11px",
    font: "500 clamp(9px,1vw,12px) var(--font-dm-mono)",
    letterSpacing: "1px",
    opacity: 0.55,
  } as const;
  return (
    <div className="flex items-center gap-[7px]" title="Accounts — coming soon">
      <button type="button" disabled className={pill} style={pillStyle}>
        LOG IN
      </button>
      <button type="button" disabled className={pill} style={pillStyle}>
        SIGN UP
      </button>
      <span
        className="bc-pixel"
        style={{ fontSize: "8px", letterSpacing: ".5px", background: "rgba(0,0,0,.4)", padding: "2px 4px", color: "#8d949c" }}
      >
        SOON
      </span>
    </div>
  );
}

/** One "prefix ____" blank in the fill-in-the-blank form. */
function Blank({
  prefix,
  k,
  value,
  placeholder,
  setF,
  onEnter,
  grow,
}: {
  prefix: string;
  k: "item" | "vibe" | "era";
  value: string;
  placeholder: string;
  setF: React.Dispatch<React.SetStateAction<{ item: string; vibe: string; era: string }>>;
  onEnter: (e: React.KeyboardEvent) => void;
  grow?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-[7px]">
      <span
        className="bc-mono whitespace-nowrap text-[#8d949c]"
        style={{ font: "400 clamp(12px,1.1vw,15px) var(--font-dm-mono)" }}
      >
        {prefix}
      </span>
      <input
        value={value}
        onChange={(e) => setF((cur) => ({ ...cur, [k]: e.target.value }))}
        onKeyDown={onEnter}
        placeholder={placeholder}
        aria-label={`${prefix} ${placeholder}`}
        className="bc-mono min-w-0 border-0 border-b border-dashed border-white/[.28] bg-transparent pb-[5px] pt-px text-[#f2f4f6]"
        style={{ flex: grow ? 1 : undefined, font: "500 clamp(14px,1.4vw,19px) var(--font-dm-mono)", caretColor: "#2ad4e0" }}
      />
    </div>
  );
}
