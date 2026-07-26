// Attribution — REQUIRED by TMDB's terms of use. Their logo, on every page
// (rendered from the root layout). A small mark pinned to the bottom-left so it
// never eats layout space. The "not endorsed or certified by TMDB" disclaimer
// still has to appear somewhere — it's slated for the FAQ / disclosure page.
// Do not remove the logo.

export function Footer() {
  return (
    <a
      href="https://www.themoviedb.org/"
      target="_blank"
      rel="noreferrer"
      aria-label="Powered by The Movie Database (TMDB)"
      className="fixed bottom-3 left-3 z-10 opacity-50 transition-opacity hover:opacity-90"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tmdb.svg" alt="The Movie Database (TMDB)" className="h-[11px] w-auto" />
    </a>
  );
}
