import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { generateArenas, ArenaGenerationError } from "@/lib/gemini";
import { savePrompt } from "@/lib/memory";
import type { Prompt } from "@/lib/types";

// PROMPT SUBMISSION API — POST /api/prompt
// Takes the user's natural-language request and returns the id of the stored
// prompt, which the client uses to open /arenas/{promptId}.
//
// POST /api/prompt
// Body: { text: string }  ->  { promptId: string }
//
// Runs Gemini arena generation, stores the Prompt in the in-memory stub, and
// returns its id. GEMINI_API_KEY lives only here (server-side).
export async function POST(request: Request) {
  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json(
      { error: "Please describe what you're looking for." },
      { status: 400 },
    );
  }

  try {
    const { hardConstraints, arenas } = await generateArenas(text.trim());
    const prompt: Prompt = {
      id: randomUUID(),
      text: text.trim(),
      hardConstraints,
      arenas,
    };
    savePrompt(prompt);
    return NextResponse.json({ promptId: prompt.id }, { status: 201 });
  } catch (err) {
    // Fail loudly — the client shows this message rather than a blank arena page.
    const message =
      err instanceof ArenaGenerationError
        ? "We couldn't generate arenas for that. Try rephrasing."
        : "Something went wrong generating arenas.";
    console.error("[/api/prompt] arena generation failed:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
