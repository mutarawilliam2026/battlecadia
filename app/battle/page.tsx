import Link from "next/link";
import { redirect } from "next/navigation";
import { fillRound, shuffle } from "@/lib/fillRound";
import { BattleArena } from "./battle";

// BATTLE PAGE — /battle?q=...
// Server half: fill round 1 and shuffle its draw order (server-side, so the
// server HTML and the hydrated client agree). The bracket itself is a client
// component that owns the loop and fetches more rounds on demand.

// Never prerender — this hits a metered API and depends on the query.
export const dynamic = "force-dynamic";

export default async function BattlePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();
  if (!query) redirect("/");

  const { round, leftover, cursor, hasMore } = await fillRound({
    query,
    cursor: null,
    canFetch: true, // round 1: null cursor means "start", so fetching is allowed
    excludeKeys: [],
    carryOver: [],
  });

  // Need a real bracket to battle. Fewer than 4 distinct products isn't one.
  if (round.length < 4) {
    return (
      <main className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-lg font-semibold">Not enough contenders</h1>
        <p className="mt-2 text-gray-600">
          Only {round.length} distinct{" "}
          {round.length === 1 ? "product" : "products"} came back for
          &ldquo;{query}&rdquo;. Try different words.
        </p>
        <Link href="/" className="mt-4 inline-block underline">
          New search
        </Link>
      </main>
    );
  }

  return (
    <BattleArena
      query={query}
      initialBracket={shuffle(round)}
      initialLeftover={leftover}
      initialCursor={cursor}
      initialHasMore={hasMore}
    />
  );
}
