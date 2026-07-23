import "server-only";

import { GoogleGenAI, Type } from "@google/genai";
import type { Arena } from "./types";
import { ARENA_SYSTEM_PROMPT } from "./prompts/arena-generation";

// Thrown when Gemini can't be reached, returns unusable output twice, or is
// misconfigured. The route handler turns this into a loud 5xx.
export class ArenaGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ArenaGenerationError";
  }
}

const AXES: Arena["axis"][] = [
  "style",
  "use_case",
  "price",
  "color",
  "condition",
  "quality",
];

// Schema-constrained JSON output. Gemini is required to return exactly this shape.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    hardConstraints: { type: Type.STRING },
    arenas: {
      type: Type.ARRAY,
      minItems: 3,
      maxItems: 5,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING },
          blurb: { type: Type.STRING },
          axis: { type: Type.STRING, enum: AXES },
          searchQuery: { type: Type.STRING },
        },
        required: ["id", "label", "blurb", "axis", "searchQuery"],
        propertyOrdering: ["id", "label", "blurb", "axis", "searchQuery"],
      },
    },
  },
  required: ["hardConstraints", "arenas"],
  propertyOrdering: ["hardConstraints", "arenas"],
};

function model(): string {
  // Configurable, never hardcoded into call sites. The fallback keeps local dev
  // working out of the box; override in .env.local to try newer models.
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalize Gemini's arenas: guarantee kebab-case, unique ids and a valid axis. */
function normalizeArenas(raw: unknown): Arena[] {
  if (!Array.isArray(raw)) {
    throw new ArenaGenerationError("Model output had no arenas array.");
  }

  const seen = new Set<string>();
  const arenas: Arena[] = [];

  raw.forEach((item, i) => {
    if (typeof item !== "object" || item === null) return;
    const a = item as Record<string, unknown>;

    const label = typeof a.label === "string" ? a.label.trim() : "";
    const blurb = typeof a.blurb === "string" ? a.blurb.trim() : "";
    const searchQuery =
      typeof a.searchQuery === "string" ? a.searchQuery.trim() : "";
    const axis = AXES.includes(a.axis as Arena["axis"])
      ? (a.axis as Arena["axis"])
      : "style";

    if (!label || !searchQuery) return; // unusable arena, drop it

    // Derive the id ourselves so [arenaId] lookups are guaranteed to resolve,
    // regardless of what the model put in `id`.
    let id = slugify(typeof a.id === "string" && a.id ? a.id : label);
    if (!id) id = `arena-${i + 1}`;
    let unique = id;
    let n = 2;
    while (seen.has(unique)) unique = `${id}-${n++}`;
    seen.add(unique);

    arenas.push({ id: unique, label, blurb, axis, searchQuery });
  });

  if (arenas.length === 0) {
    throw new ArenaGenerationError("Model returned no usable arenas.");
  }
  return arenas;
}

type ArenaGenResult = { hardConstraints: string; arenas: Arena[] };

/**
 * Generate arenas for a user's request. One Gemini call, schema-constrained.
 * On malformed JSON we retry ONCE, then fail loudly — no silent fallback.
 */
export async function generateArenas(text: string): Promise<ArenaGenResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ArenaGenerationError("GEMINI_API_KEY is not set.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const attempt = async (): Promise<ArenaGenResult> => {
    const response = await ai.models.generateContent({
      model: model(),
      contents: text,
      config: {
        systemInstruction: ARENA_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.7,
      },
    });

    const body = response.text;
    if (!body) throw new ArenaGenerationError("Empty response from model.");

    // Even with a response schema, parse defensively.
    const parsed = JSON.parse(body) as {
      hardConstraints?: unknown;
      arenas?: unknown;
    };

    return {
      hardConstraints:
        typeof parsed.hardConstraints === "string"
          ? parsed.hardConstraints.trim()
          : "",
      arenas: normalizeArenas(parsed.arenas),
    };
  };

  try {
    return await attempt();
  } catch (first) {
    // Retry once. A transient bad generation usually clears on a second pass.
    try {
      return await attempt();
    } catch (second) {
      throw new ArenaGenerationError(
        "Gemini failed to produce valid arenas after a retry.",
        second instanceof Error ? second : first,
      );
    }
  }
}
