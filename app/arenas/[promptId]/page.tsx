import Link from "next/link";
import { getPrompt } from "@/lib/memory";

// ARENAS PAGE — /arenas/{promptId}
// Shows the arenas generated from the user's prompt.
// Tapping one opens the contenders page.
//
// Renders the arenas Gemini generated for a prompt, plus the
// original text and parsed hard constraints so the user can eyeball whether
// Gemini understood. Each arena links to its contenders page.
export default async function ArenasPage({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  const { promptId } = await params;
  const prompt = getPrompt(promptId);

  // In-memory stub miss — be explicit that state was cleared, not that the id
  // was never real. (Distinct from a generic 404.)
  if (!prompt) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-red-600">
          This prompt is no longer in memory — the server restarted and the
          temporary store was cleared.
        </p>
        <Link href="/" className="mt-4 inline-block underline">
          Start over
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/" className="text-sm underline">
        ← New search
      </Link>

      <section className="mt-4">
        <h2 className="text-sm uppercase tracking-wide text-gray-500">
          Your request
        </h2>
        <p className="mt-1">{prompt.text}</p>
      </section>

      <section className="mt-4">
        <h2 className="text-sm uppercase tracking-wide text-gray-500">
          Hard constraints (parsed)
        </h2>
        <p className="mt-1">{prompt.hardConstraints || "— none detected —"}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Pick an arena</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {prompt.arenas.map((arena) => (
            <li key={arena.id}>
              <Link
                href={`/arenas/${prompt.id}/${arena.id}`}
                className="block rounded border border-gray-300 p-4 hover:bg-gray-50"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{arena.label}</span>
                  <span className="text-xs text-gray-400">{arena.axis}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{arena.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
