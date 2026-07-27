"use client";

// REFINE PANEL — the cyan filter tray above the battle. Purely presentational:
// the server has already computed which axes genuinely split the current pool
// (facets) and resolved the active refinements to chip labels (applied). Every
// change navigates to a new /battle URL — the page re-renders, facets are
// RECOMPUTED against the narrowed pool, and the battle restarts. No Gemini call
// involved. Its open/closed state is owned by the battle header (REFINE button).

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppliedChip, Facet, RefinementKey, Refinements } from "@/lib/types";
import { buildBattleUrl, withRefinement, withoutRefinement } from "@/lib/refine";

export function RefinePanel({
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
  const [axis, setAxis] = useState<RefinementKey | null>(null);
  const active = facets.find((f) => f.key === axis) ?? null;

  return (
    // No outer chrome — this renders inside the shared Overlay panel, which
    // supplies the solid background, border, and padding.
    <div className="box-border">
      {/* Active refinements — cyan, click to remove */}
      {applied.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-[7px]">
          {applied.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() =>
                router.push(buildBattleUrl(query, withoutRefinement(refinements, chip.key)))
              }
              className="bc-mono inline-flex cursor-pointer items-center gap-1 bg-[#2ad4e0] text-[#06232a]"
              style={{ padding: "8px 11px", font: "500 clamp(9px,.95vw,12px) var(--font-dm-mono)", letterSpacing: ".4px" }}
            >
              {chip.label}
              <span aria-hidden className="text-[#06232a]/60">×</span>
            </button>
          ))}
        </div>
      )}

      {/* Axis picker → value picker */}
      {facets.length === 0 ? (
        <div className="bc-mono text-[#6aa84f]" style={{ font: "400 clamp(9px,.95vw,12px) var(--font-dm-mono)", letterSpacing: "1px" }}>
          {applied.length > 0 ? "REMOVE A FILTER TO WIDEN THE POOL" : "NO FILTERS SPLIT THIS POOL"}
        </div>
      ) : active === null ? (
        <div className="flex flex-wrap gap-[7px]">
          {facets.map((f) => (
            <OutlineChip key={f.key} onClick={() => setAxis(f.key)}>
              {f.label}
            </OutlineChip>
          ))}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAxis(null)}
            className="bc-mono mb-3 cursor-pointer text-[#5a626b] underline"
            style={{ fontSize: "clamp(9px,.95vw,12px)" }}
          >
            ← dimensions
          </button>
          <div className="flex flex-wrap gap-[7px]">
            {active.values.map((v) => (
              <OutlineChip
                key={v.value}
                onClick={() =>
                  router.push(buildBattleUrl(query, withRefinement(refinements, active.key, v.value)))
                }
              >
                {v.label} <span className="text-[#7f8b98]">({v.count})</span>
              </OutlineChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutlineChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bc-mono cursor-pointer border border-white/[.2] bg-white/[.06] text-[#cfd6de] transition-colors hover:bg-white/[.14]"
      style={{ padding: "8px 11px", font: "500 clamp(9px,.95vw,12px) var(--font-dm-mono)", letterSpacing: ".4px" }}
    >
      {children}
    </button>
  );
}
