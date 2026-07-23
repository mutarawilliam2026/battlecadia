import Link from "next/link";
import { getPrompt } from "@/lib/memory";
import { searchContenders, ContenderSearchError } from "@/lib/channel3";
import { MIN_CONTENDERS, shuffle } from "@/lib/battle";
import { BattleArena } from "./battle";
import type { Contender } from "@/lib/types";

// Never prerender at build time — this route calls a METERED API. Rendering must
// only happen on a real request, for the one arena the user opened.
export const dynamic = "force-dynamic";

// BATTLE PAGE — /arenas/{promptId}/{arenaId}
// Runs one arena's winner-stays bracket to a single champion.
// Tapping a card picks the winner of that matchup.
//
// Server half: one search, deduped, shuffled. The bracket itself is a client
// component (./battle) — it gets the contenders as a prop and fetches nothing.
export default async function BattlePage({
  params,
}: {
  params: Promise<{ promptId: string; arenaId: string }>;
}) {
  const { promptId, arenaId } = await params;
  const prompt = getPrompt(promptId);

  if (!prompt) {
    return (
      <Shell>
        <p className="text-red-600">
          This prompt is no longer in memory — the server restarted and the
          temporary store was cleared.
        </p>
        <Link href="/" className="mt-4 inline-block underline">
          Start over
        </Link>
      </Shell>
    );
  }

  const arena = prompt.arenas.find((a) => a.id === arenaId);
  if (!arena) {
    return (
      <Shell backHref={`/arenas/${prompt.id}`}>
        <p className="text-red-600">
          Unknown arena &ldquo;{arenaId}&rdquo; for this prompt.
        </p>
      </Shell>
    );
  }

  let contenders: Contender[];
  try {
    contenders = await searchContenders(arena.searchQuery);
  } catch (err) {
    return (
      <Shell backHref={`/arenas/${prompt.id}`} arenaLabel={arena.label}>
        <SearchError err={err} />
      </Shell>
    );
  }

  if (contenders.length < MIN_CONTENDERS) {
    return (
      <Shell backHref={`/arenas/${prompt.id}`} arenaLabel={arena.label}>
        {/* Distinct from an error: the search worked, there just isn't enough
            here to make a bracket worth playing. */}
        <p className="mt-6 text-gray-600">
          Not enough contenders for a battle — only {contenders.length} distinct{" "}
          {contenders.length === 1 ? "product" : "products"} came back. Try
          another arena.
        </p>
      </Shell>
    );
  }

  // Shuffle HERE, not in the client component: a Math.random() call inside a
  // useState initializer would run once during SSR and again on hydration and
  // produce two different orders.
  const lineup = shuffle(contenders);

  return (
    <Shell backHref={`/arenas/${prompt.id}`} arenaLabel={arena.label}>
      <BattleArena contenders={lineup} promptId={prompt.id} />
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
  backHref,
  arenaLabel,
}: {
  children: React.ReactNode;
  backHref?: string;
  arenaLabel?: string;
}) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      {backHref && (
        <Link href={backHref} className="text-sm underline">
          ← Back to arenas
        </Link>
      )}
      {arenaLabel && <h1 className="mt-3 text-xl font-semibold">{arenaLabel}</h1>}
      {children}
    </main>
  );
}
