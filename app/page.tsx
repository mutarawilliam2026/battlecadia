"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// PROMPT PAGE — /
// Where the user describes what they're shopping for.
// Submitting generates the arenas and opens /arenas/{promptId}.
//
// A textarea and a submit button. On submit we POST the text,
// get back a promptId, and navigate to its arenas page.
//
// Deliberately SUBMIT-ONLY: no search-as-you-type, no effect-triggered calls.
// Everything downstream is metered, so nothing fires until the user acts.
export default function PromptPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Type what you're looking for first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push(`/arenas/${data.promptId}`);
      // Leave `submitting` true — we're navigating away.
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Battlecadia</h1>
      <p className="mt-1 text-sm text-gray-500">
        Describe what you want. We&apos;ll set up the battles.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="i want a new pair of shoes for men size 10.5 and under $500"
          className="w-full rounded border border-gray-300 p-3"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Generating arenas…" : "Find contenders"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
