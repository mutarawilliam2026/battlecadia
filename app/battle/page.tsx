import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  AppliedChip,
  Contender,
  EnrichedFilm,
  Facet,
  SearchPlan,
} from "@/lib/types";
import { resolveSearch, buildEnrichedPool, getGenres } from "@/lib/tmdb";
import { computeFacets, computeApplied } from "@/lib/facets";
import { shuffle } from "@/lib/battle";
import { parseRefinements, refineKey } from "@/lib/refine";
import { BattleScreen } from "./battle";

// BATTLE PAGE — /battle?q=...&genre=...&rating=...&keyword=...
// Server half: resolve the sentence (Gemini → TMDB, memoized so refinements
// never re-run the model), apply the URL's refinements, build + enrich a ~40
// film pool, and compute the facets that genuinely split it. The battle uses
// the top 10 (shuffled server-side for hydration parity); the rest profiles.

// Never prerender — this hits a metered API and depends on the query.
export const dynamic = "force-dynamic";

type Loaded = {
  plan: SearchPlan;
  pool: Contender[];
  facets: Facet[];
  applied: AppliedChip[];
  page: number;
  totalPages: number;
};

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Strip enrichment back to a Contender for the battle's lean client payload. */
function plain(f: EnrichedFilm): Contender {
  return {
    id: f.id,
    title: f.title,
    year: f.year,
    posterUrl: f.posterUrl,
    overview: f.overview,
    rating: f.rating,
    voteCount: f.voteCount,
    genreIds: f.genreIds,
    language: f.language,
  };
}

export default async function BattlePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = first(sp.q).trim();
  if (!query) redirect("/");

  const refinements = parseRefinements(sp);

  // Fetch inside try/catch, but build JSX afterwards — a render error must not
  // be swallowed here (it belongs to an error boundary, not this try).
  let loaded: Loaded | null = null;
  try {
    const { plan } = await resolveSearch(query);
    const genres = await getGenres();
    const enriched = await buildEnrichedPool(plan, refinements);
    loaded = {
      plan,
      pool: enriched.films.map(plain),
      facets: computeFacets(enriched.films, genres),
      applied: computeApplied(refinements, enriched.films, genres),
      page: enriched.page,
      totalPages: enriched.totalPages,
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

  // Top 10 by relevance FIRST, then shuffle those 10 for draw order. The rest
  // stay in relevance order as the buffer. The empty-pool case (fewer than 4)
  // is handled inside BattleScreen so the Refine chips stay visible. Keying on
  // the refinement signature remounts a fresh battle whenever a filter changes.
  return (
    <BattleScreen
      key={refineKey(refinements)}
      query={query}
      plan={loaded.plan}
      refinements={refinements}
      facets={loaded.facets}
      applied={loaded.applied}
      initialContenders={shuffle(loaded.pool.slice(0, 10))}
      initialBuffer={loaded.pool.slice(10)}
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
      <h1 className="bc-mono text-lg uppercase tracking-wide text-[#f2f4f6]">
        {title}
      </h1>
      <p className="bc-mono mt-3 text-sm text-[#8d949c]">{children}</p>
      <Link
        href="/"
        className="bc-pixel mt-5 inline-block text-xs uppercase tracking-widest text-[#2ad4e0]"
      >
        ← New arena
      </Link>
    </main>
  );
}
