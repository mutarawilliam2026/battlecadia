import type { Prompt } from "./types";

// ---------------------------------------------------------------------------
// DELIBERATE STUB — server-side, in-memory prompt store.
//
// This is a module-level Map keyed by promptId. Supabase replaces it in a
// later slice. Known limitations, ACCEPTED for this slice:
//   - It dies on server restart (and on every HMR reload in dev — mitigated
//     below by stashing it on globalThis so edits don't wipe an active demo).
//   - It does NOT work across serverless instances: a POST that writes on one
//     lambda and a page render that reads on another will miss. Fine locally
//     (single Node process); would break on Vercel's multi-instance runtime.
//
// Pages surface a clear "prompt expired" message when a lookup misses, rather
// than pretending the id was never valid.
// ---------------------------------------------------------------------------

const globalForMemory = globalThis as unknown as {
  __battlecadiaPrompts?: Map<string, Prompt>;
};

const prompts: Map<string, Prompt> =
  globalForMemory.__battlecadiaPrompts ??
  (globalForMemory.__battlecadiaPrompts = new Map());

export function savePrompt(prompt: Prompt): void {
  prompts.set(prompt.id, prompt);
}

export function getPrompt(id: string): Prompt | undefined {
  return prompts.get(id);
}
