// The Battlecadia mark: a chunky beveled cyan tile with a pixel "B", in the same
// 3D-bevel language as the arena tiles. Sits before the wordmark in the header.
// Decorative — the surrounding link already labels the destination, so it's
// aria-hidden.

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`bc-pixel inline-flex flex-none items-center justify-center ${className}`}
      style={{
        boxSizing: "border-box",
        width: "clamp(20px,2.1vw,27px)",
        height: "clamp(20px,2.1vw,27px)",
        background: "#2ad4e0",
        color: "#062a30",
        font: "700 clamp(11px,1.2vw,15px) var(--font-silkscreen)",
        lineHeight: 1,
        borderTop: "2px solid rgba(255,255,255,.5)",
        borderLeft: "2px solid rgba(255,255,255,.28)",
        borderRight: "2px solid rgba(0,0,0,.4)",
        borderBottom: "2px solid rgba(0,0,0,.55)",
      }}
    >
      B
    </span>
  );
}
