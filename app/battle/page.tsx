import Link from "next/link";
import { redirect } from "next/navigation";
import type { Contender, SearchPlan } from "@/lib/types";
import { resolveSearch, fetchContenders } from "@/lib/tmdb";
import { shuffle, MIN_CONTENDERS } from "@/lib/battle";
import { BattleArena } from "./battle";

// BATTLE PAGE — /battle?q=...
// Server half: resolve the sentence (Gemini → TMDB), fetch page 1, take the top
// 10 by relevance and shuffle THOSE for draw order (server-side, so the SSR HTML
// and the hydrated client agree). The bracket itself is a client component.

// Never prerender — this hits a metered API and depends on the query.
export const dynamic = "force-dynamic";

type Loaded = {
  contenders: Contender[];
  plan: SearchPlan;
  page: number;
  totalPages: number;
};

export default async function BattlePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();
  if (!query) redirect("/");

  // Fetch inside try/catch, but build JSX afterwards — a render error must not
  // be swallowed here (it belongs to an error boundary, not this try).
  let loaded: Loaded | null = null;
  try {
    const { plan } = await resolveSearch(query);
    const page1 = await fetchContenders(plan, 1);
    loaded = {
      contenders: page1.contenders,
      plan,
      page: page1.page,
      totalPages: page1.totalPages,
    };
  } catch {
    loaded = null;
  }

  if (!loaded) {
    return (
      <Notice title="Something went wrong">
        We couldn&rsquo;t search for &ldquo;{query}&rdquo; just now. Try again in
        a moment.
      </Notice>
    );
  }

  const pool = loaded.contenders;

  // Not enough distinct films with posters to make a bracket.
  if (pool.length < MIN_CONTENDERS) {
    return (
      <Notice title="Not enough contenders">
        Only {pool.length} usable {pool.length === 1 ? "film" : "films"} came
        back for &ldquo;{query}&rdquo;. Try different words.
      </Notice>
    );
  }

  // Top 10 by relevance FIRST, then shuffle those 10 for draw order. The rest
  // stay in relevance order as the buffer for later rounds.
  return (
    <BattleArena
      plan={loaded.plan}
      initialContenders={shuffle(pool.slice(0, 10))}
      initialBuffer={pool.slice(10)}
      initialPage={loaded.page}
      totalPages={loaded.totalPages}
    />
  );
}

function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-xl flex-1 p-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-gray-600">{children}</p>
      <Link href="/" className="mt-4 inline-block underline">
        New search
      </Link>
    </main>
  );
}
