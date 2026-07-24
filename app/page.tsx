"use client";

// SEARCH PAGE — /
// Describe what you want; submit navigates to /battle?q=...
//
// No POST, no stored record, no id: the query lives in the URL so the results
// page is refreshable and shareable.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    router.push(`/battle?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Battlecadia</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="I want blue headphones under $50"
          className="w-full rounded border border-gray-300 p-3"
        />
        <button
          type="submit"
          className="self-start rounded bg-black px-4 py-2 text-white"
        >
          Search
        </button>
      </form>
    </main>
  );
}
