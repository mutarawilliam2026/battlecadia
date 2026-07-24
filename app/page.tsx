"use client";

// PROMPT PAGE — /
// Where the user describes what they're shopping for.
// Submitting navigates straight to /battle?q=...
//
// No POST and no stored record: the query travels in the URL, so a battle is
// shareable and refreshable and there is nothing on the server to expire.
//
// Deliberately SUBMIT-ONLY: no search-as-you-type, no effect-triggered calls.
// Everything downstream is metered, so nothing fires until the user acts.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PromptPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Type what you're looking for first.");
      return;
    }
    setError(null);
    router.push(`/battle?q=${encodeURIComponent(trimmed)}`);
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
          placeholder="I want skateboards"
          className="w-full rounded border border-gray-300 p-3"
        />
        <button
          type="submit"
          className="self-start rounded bg-black px-4 py-2 text-white"
        >
          Find contenders
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
