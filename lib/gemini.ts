import type { MovieQuery } from "./types";
import { buildMovieSystemPrompt } from "./moviePrompt";

// ---------------------------------------------------------------------------
// The natural-language → MovieQuery translation. One schema-constrained Gemini
// call. Server-side only (reads GEMINI_API_KEY). The model is env-driven
// (GEMINI_MODEL) so it can change without a code edit.
//
// Genres are passed in rather than fetched here, so this module doesn't depend
// on lib/tmdb.ts (which depends on this one).
// ---------------------------------------------------------------------------

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// OpenAPI-subset schema Gemini constrains its JSON to (verified against
// ai.google.dev/api/generate-content: OBJECT/ARRAY/STRING/INTEGER/NUMBER with a
// `nullable` boolean).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    genreIds: { type: "ARRAY", items: { type: "INTEGER" } },
    yearFrom: { type: "INTEGER", nullable: true },
    yearTo: { type: "INTEGER", nullable: true },
    minRating: { type: "NUMBER", nullable: true },
    sortBy: { type: "STRING" },
    titleSearch: { type: "STRING", nullable: true },
  },
  required: ["genreIds", "yearFrom", "yearTo", "minRating", "sortBy", "titleSearch"],
  propertyOrdering: [
    "genreIds",
    "yearFrom",
    "yearTo",
    "minRating",
    "sortBy",
    "titleSearch",
  ],
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

export async function parseMovieQuery(
  prompt: string,
  genres: { id: number; name: string }[],
): Promise<MovieQuery> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) {
    throw new Error(
      "GEMINI_API_KEY / GEMINI_MODEL are not set (see .env.local.example).",
    );
  }

  const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildMovieSystemPrompt(genres) }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Gemini request failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as GeminiResponse;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");

  return normalize(JSON.parse(text));
}

/** Coerce Gemini's output into a valid MovieQuery, defending against stray shapes. */
function normalize(raw: unknown): MovieQuery {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return {
    genreIds: Array.isArray(o.genreIds)
      ? o.genreIds.map(Number).filter((n) => Number.isFinite(n))
      : [],
    yearFrom: num(o.yearFrom),
    yearTo: num(o.yearTo),
    minRating: num(o.minRating),
    sortBy:
      typeof o.sortBy === "string" && o.sortBy ? o.sortBy : "popularity.desc",
    titleSearch:
      typeof o.titleSearch === "string" && o.titleSearch.trim()
        ? o.titleSearch.trim()
        : null,
  };
}
