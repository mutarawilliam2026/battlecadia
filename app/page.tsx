"use client";

// SEARCH PAGE — /
// A textarea and a submit button. Submitting navigates to /battle?q=... — the
// query lives in the URL, no POST, no stored id.

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [text, setText] = useState("");

  function submit() {
    const q = text.trim();
    if (!q) return;
    router.push(`/battle?q=${encodeURIComponent(q)}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center p-6">
      <h1 className="text-3xl font-black tracking-tight">Battlecadia</h1>
      <p className="mt-2 text-gray-600">
        Describe what you want to watch. Then battle the matches head to head
        until one film is crowned.
      </p>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter makes a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="a scary movie from the 80s"
          aria-label="Describe what you want to watch"
          className="w-full resize-none rounded-lg border border-gray-300 p-4 text-base outline-none focus:border-gray-900"
        />
        <button
          type="submit"
          className="mt-3 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
        >
          Start battle
        </button>
      </form>
    </main>
  );
}
