import Link from "next/link";
import { redirect } from "next/navigation";
import { searchContenders, ContenderSearchError } from "@/lib/channel3";
import { MIN_CONTENDERS, shuffle } from "@/lib/battle";
import { BattleArena } from "./battle";
import type { Contender } from "@/lib/types";

// Never prerender at build time — this route calls a METERED API. Rendering must
// only happen on a real request.
export const dynamic = "force-dynamic";

// BATTLE PAGE — /battle?q=I+want+skateboards
// Searches for the query in the URL and runs a winner-stays bracket over the
// results until one champion is left.
//
// The query lives in the URL on purpose: there is no server-side record to
// expire, so a battle survives a restart, a refresh, and being shared.
//
// Server half: one search, deduped, shuffled. The bracket itself is a client
// component (./battle) — it gets the contenders as a prop and fetches nothing.
export default async function BattlePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  // Nothing to search for — don't burn a credit on an empty query.
  if (!query) redirect("/");

  let contenders: Contender[];
  try {
    // Straight to Channel3, no LLM in between: agentic mode does its own query
    // planning, so it parses "blue headphones under $50" without help.
    contenders = await searchContenders(query);
  } catch (err) {
    return (
      <Shell query={query}>
        <SearchError err={err} />
      </Shell>
    );
  }

  if (contenders.length < MIN_CONTENDERS) {
    return (
      <Shell query={query}>
        {/* Distinct from an error: the search worked, there just isn't enough
            here to make a bracket worth playing. */}
        <p className="mt-6 text-gray-600">
          Not enough contenders for a battle — only {contenders.length} distinct{" "}
          {contenders.length === 1 ? "product" : "products"} came back.
        </p>
        <Link href="/" className="mt-4 inline-block underline">
          Try another search
        </Link>
      </Shell>
    );
  }

  // Shuffle HERE, not in the client component: a Math.random() call inside a
  // useState initializer would run once during SSR and again on hydration and
  // produce two different orders.
  const lineup = shuffle(contenders);

  return (
    <Shell query={query}>
      <BattleArena contenders={lineup} />
    </Shell>
  );
}

function SearchError({ err }: { err: unknown }) {
  const kind = err instanceof ContenderSearchError ? err.kind : "upstream";
  // Each kind reads differently — an out-of-credits wall must never be mistaken
  // for "no results".
  const message = {
    out_of_credits:
      "Out of Channel3 credits (or rate limited). This is a billing/quota issue, NOT an empty result — no products were searched.",
    auth: "Channel3 rejected the API key. Check CHANNEL3_API_KEY.",
    bad_request: "Channel3 rejected the search request as malformed.",
    upstream: "Channel3 search failed (upstream error). Try again shortly.",
  }[kind];

  return <p className="mt-6 text-red-600">{message}</p>;
}

function Shell({
  children,
  query,
}: {
  children: React.ReactNode;
  query: string;
}) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/" className="text-sm underline">
        ← New search
      </Link>
      <h1 className="mt-3 text-xl font-semibold">{query}</h1>
      {children}
    </main>
  );
}
