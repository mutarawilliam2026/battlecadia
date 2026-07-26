"use client";

// REFINE — the filter panel above the battle. Purely presentational: the server
// has already computed which axes genuinely split the current pool (facets) and
// resolved the active refinements to chip labels (applied). Every change
// navigates to a new /battle URL — the page re-renders, facets are RECOMPUTED
// against the narrowed pool, and the battle restarts. No Gemini call involved.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppliedChip, Facet, RefinementKey, Refinements } from "@/lib/types";
import { buildBattleUrl, withRefinement, withoutRefinement } from "@/lib/refine";

export function RefineBar({
  query,
  refinements,
  facets,
  applied,
}: {
  query: string;
  refinements: Refinements;
  facets: Facet[];
  applied: AppliedChip[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [axis, setAxis] = useState<RefinementKey | null>(null);

  const active = facets.find((f) => f.key === axis) ?? null;

  function navigate(url: string) {
    router.push(url);
    setOpen(false);
    setAxis(null);
  }

  return (
    <div>
      {/* Query text + applied refinement chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-700">{query}</span>
        {applied.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() =>
              router.push(
                buildBattleUrl(query, withoutRefinement(refinements, chip.key)),
              )
            }
            className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs text-white"
          >
            {chip.label}
            <span aria-hidden className="text-gray-300">
              ×
            </span>
          </button>
        ))}
      </div>

      {facets.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              setAxis(null);
            }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {open ? "Close" : "Refine"}
          </button>
        </div>
      )}

      {open && (
        <div className="mt-3 rounded-lg border border-gray-200 p-4">
          {active === null ? (
            <div className="flex flex-wrap gap-2">
              {facets.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setAxis(f.key)}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setAxis(null)}
                className="mb-3 text-xs text-gray-500 underline"
              >
                ← dimensions
              </button>
              <div className="flex flex-wrap gap-2">
                {active.values.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() =>
                      navigate(
                        buildBattleUrl(
                          query,
                          withRefinement(refinements, active.key, v.value),
                        ),
                      )
                    }
                    className="rounded-full border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    {v.label}{" "}
                    <span className="text-gray-400">({v.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
