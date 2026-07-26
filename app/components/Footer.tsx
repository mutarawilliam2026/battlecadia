// Attribution — REQUIRED by TMDB's terms of use. Their logo, on every page
// (rendered from the root layout). A small mark fixed to the bottom-left, but
// pinned inside a centred max-width track so it lines up with the page content
// (the OUT well / wordmark) rather than floating in the corner. The "not
// endorsed or certified by TMDB" disclaimer still has to appear somewhere —
// it's slated for the FAQ / disclosure page. Do not remove the logo.

export function Footer() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10"
      style={{
        paddingLeft: "clamp(12px,3vw,44px)",
        paddingRight: "clamp(12px,3vw,44px)",
        paddingBottom: "clamp(9px,1.4vw,16px)",
      }}
    >
      <div className="mx-auto w-full max-w-[1500px]">
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noreferrer"
          aria-label="Powered by The Movie Database (TMDB)"
          className="pointer-events-auto inline-block opacity-50 transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tmdb.svg" alt="The Movie Database (TMDB)" className="h-[11px] w-auto" />
        </a>
      </div>
    </div>
  );
}
