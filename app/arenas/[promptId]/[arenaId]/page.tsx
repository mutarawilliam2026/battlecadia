import Link from "next/link";
import { getPrompt } from "@/lib/memory";
import { searchContenders, ContenderSearchError } from "@/lib/channel3";
import type { Contender } from "@/lib/types";

// Never prerender at build time — this route calls a METERED API. Rendering must
// only happen on a real request, for the one arena the user opened.
export const dynamic = "force-dynamic";

// CONTENDERS PAGE — /arenas/{promptId}/{arenaId}
// Shows the products competing inside one arena.
// This is where the battle loop will eventually run.
//
// Searches Channel3 for the opened arena and lists what
// comes back: image, title, brand, price. Nothing interactive yet.
export default async function ContendersPage({
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

  return (
    <Shell backHref={`/arenas/${prompt.id}`} arenaLabel={arena.label}>
      <p className="text-sm text-gray-500">
        Searched: <span className="italic">{arena.searchQuery}</span>
      </p>

      {contenders.length === 0 ? (
        // Distinct from an error: the search succeeded, nothing matched.
        <p className="mt-6 text-gray-600">
          No products found for this arena.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {contenders.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-4 rounded border border-gray-200 p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.imageUrl ?? ""}
                alt={c.title}
                width={64}
                height={64}
                className="h-16 w-16 flex-shrink-0 rounded bg-gray-100 object-contain"
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-sm text-gray-500">{c.brand ?? "—"}</p>
                <p className="text-sm">{formatPrice(c.price)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function formatPrice(price: Contender["price"]): string {
  if (!price) return "Price unavailable";
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency,
    }).format(price.amount);
    if (price.compareAt && price.compareAt > price.amount) {
      const was = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: price.currency,
      }).format(price.compareAt);
      return `${formatted} (was ${was})`;
    }
    return formatted;
  } catch {
    return `${price.amount} ${price.currency}`;
  }
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
