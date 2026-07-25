"use client";

// SEARCH PAGE — /
// Brand top-left, the arena entrance (search) centered. Submitting navigates
// to /battle?q=... — the query lives in the URL, no POST, no stored record.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "running shoes under $120",
  "a mechanical keyboard",
  "wireless earbuds under $80",
];

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/battle?q=${encodeURIComponent(trimmed)}`);
  }

  function fillExample(example: string) {
    setText(example);
    inputRef.current?.focus();
  }

  return (
    <main className="relative flex min-h-screen flex-1 flex-col overflow-hidden bg-[var(--bc-bg)] text-[var(--bc-ink)]">
      {/* Signature: an oversized VS behind the arena entrance — champion red,
          challenger blue, held to a whisper so it sets mood, not noise. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
      >
        <span
          className="font-[family-name:var(--font-display)] font-black leading-none tracking-tighter"
          style={{ fontSize: "min(46vw, 40rem)" }}
        >
          <span className="text-[var(--bc-red)] opacity-[0.05]">V</span>
          <span className="text-[var(--bc-blue)] opacity-[0.05]">S</span>
        </span>
      </div>

      {/* Brand, top-left */}
      <header className="relative z-10 flex items-center gap-2.5 p-6 sm:p-8">
        <span className="font-[family-name:var(--font-display)] text-xl font-extrabold tracking-tight">
          BattleCadia
        </span>
        <span className="rounded-full border border-[var(--bc-blue)]/25 bg-[var(--bc-blue)]/10 px-2 py-0.5 font-[family-name:var(--font-geist-mono)] text-[10px] font-medium uppercase tracking-widest text-[var(--bc-blue)]">
          Beta
        </span>
      </header>

      {/* Arena entrance, centered */}
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <div className="w-full max-w-2xl text-center">
          <p className="bc-rise bc-rise-1 font-[family-name:var(--font-geist-mono)] text-xs font-medium uppercase tracking-[0.25em] text-[var(--bc-muted)]">
            Head-to-head shopping
          </p>

          <h1 className="bc-rise bc-rise-2 mt-4 font-[family-name:var(--font-display)] text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">
            Don&rsquo;t browse. Battle.
          </h1>

          <p className="bc-rise bc-rise-3 mx-auto mt-5 max-w-md text-base leading-relaxed text-[var(--bc-muted)]">
            Describe what you want. We line up the best matches and you crown a
            winner, one matchup at a time.
          </p>

          <form
            className="bc-rise bc-rise-4 mt-9"
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
          >
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--bc-line)] bg-white p-2 pl-4 shadow-[0_1px_2px_rgba(21,23,28,0.04),0_12px_28px_-12px_rgba(21,23,28,0.18)] transition-all duration-200 focus-within:-translate-y-0.5 focus-within:border-[var(--bc-red)] focus-within:shadow-[0_1px_2px_rgba(21,23,28,0.04),0_18px_40px_-14px_rgba(226,59,46,0.35)]">
              <SearchIcon />
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                type="text"
                aria-label="Describe what you want to shop for"
                placeholder="I want blue headphones under $50"
                className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-[var(--bc-muted)]/70"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-[var(--bc-red)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c9311f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bc-red)]"
              >
                Search
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-wider text-[var(--bc-muted)]/70">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => fillExample(example)}
                className="rounded-full border border-[var(--bc-line)] bg-white/60 px-3 py-1 text-sm text-[var(--bc-muted)] transition-colors hover:border-[var(--bc-ink)]/20 hover:text-[var(--bc-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bc-blue)]"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="ml-1 h-5 w-5 shrink-0 text-[var(--bc-muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="m17 17-3.5-3.5" />
    </svg>
  );
}
