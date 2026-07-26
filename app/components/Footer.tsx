// Attribution — REQUIRED by TMDB's terms of use. Their logo plus the exact
// disclaimer, on every page (rendered from the root layout). Do not remove.

export function Footer() {
  return (
    <footer className="mt-auto flex flex-col items-center gap-2 border-t border-white/10 p-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/tmdb.svg"
        alt="The Movie Database (TMDB)"
        className="h-4 w-auto opacity-80"
      />
      <p className="bc-mono max-w-md text-[11px] leading-relaxed tracking-wide text-[#5a626b]">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  );
}
