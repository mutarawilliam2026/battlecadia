"use client";

// A modal overlay: a dimmed backdrop plus a solid, opaque panel on top of
// whatever is behind it — used for the battle's REFINE tray and the champion's
// WHERE-TO-WATCH list. Both need to sit ABOVE the page without shifting or
// resizing it, and both must read clearly (no bleed-through). Clicking the
// backdrop, the ✕, or pressing Esc dismisses it; the caller keeps its own state,
// so closing never resets what's underneath.

import { useEffect } from "react";

export function Overlay({
  title,
  onClose,
  children,
  maxWidth = 560,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ padding: "clamp(16px,4vw,48px)" }}
      onClick={onClose}
    >
      {/* Dimmed backdrop — the battle stays visibly behind, not bleeding through. */}
      <div className="absolute inset-0" style={{ background: "rgba(4,5,7,.74)" }} />

      {/* Solid, opaque panel. stopPropagation so clicks inside don't dismiss. */}
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bc-panel relative z-10 box-border flex max-h-full w-full flex-col overflow-hidden"
        style={{
          maxWidth,
          animation: "bccrown .18s ease-out",
        }}
      >
        <div
          className="flex flex-none items-center justify-between border-b border-white/[.1]"
          style={{ padding: "clamp(11px,1.3vw,15px) clamp(13px,1.5vw,19px)" }}
        >
          <span
            className="bc-pixel text-[#f2f4f6]"
            style={{ fontSize: "clamp(9px,1vw,13px)", letterSpacing: ".7px" }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bc-mono cursor-pointer border border-white/[.16] bg-white/[.05] text-[#cfd6de] transition-colors hover:bg-white/[.14]"
            style={{ padding: "4px 10px", font: "500 clamp(11px,1.1vw,14px) var(--font-dm-mono)" }}
          >
            ✕
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto"
          style={{ padding: "clamp(13px,1.5vw,20px)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
