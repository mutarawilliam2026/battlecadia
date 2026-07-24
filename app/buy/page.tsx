import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchBuyListing, ContenderSearchError } from "@/lib/channel3";
import { formatPrice } from "@/lib/format";
import type { BuyListing } from "@/lib/channel3";

// Offer URLs are short-lived, so this must never be prerendered or cached —
// every render re-resolves them.
export const dynamic = "force-dynamic";

// BUY PAGE — /buy?ids=A,B,C&q=...
// Shows every shop selling the champion, cheapest first.
// Each row links straight out to the merchant, who handles checkout.
//
// `ids` are the champion's sourceIds: the same product listed by several
// merchants arrives as several products, and each one knows about different
// offers. Re-resolving all of them is FREE (GET /v1/products/{id} costs no
// credits), and refetching at display time is what the docs prescribe.

// Sanity cap — a champion merges a handful of listings, not hundreds.
const MAX_IDS = 12;

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; q?: string }>;
}) {
  const { ids, q } = await searchParams;
  const productIds = (ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  if (productIds.length === 0) redirect("/");

  const backHref = q ? `/battle?q=${encodeURIComponent(q)}` : "/";

  let listing: BuyListing | null;
  try {
    listing = await fetchBuyListing(productIds);
  } catch (err) {
    const message =
      err instanceof ContenderSearchError && err.kind === "auth"
        ? "Channel3 rejected the API key. Check CHANNEL3_API_KEY."
        : "Couldn't load offers for this product. Try again shortly.";
    return (
      <Shell backHref={backHref}>
        <p className="mt-6 text-red-600">{message}</p>
      </Shell>
    );
  }

  if (!listing) {
    return (
      <Shell backHref={backHref}>
        <p className="mt-6 text-gray-600">
          This product could no longer be resolved.
        </p>
      </Shell>
    );
  }

  const { offers } = listing;
  // Only worth calling out a winner when there's something to beat.
  const cheapestPrice = offers.length > 1 ? offers[0]?.price.amount : null;

  return (
    <Shell backHref={backHref}>
      <div className="mt-6 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={listing.imageUrl ?? ""}
          alt={listing.title}
          width={96}
          height={96}
          className="h-24 w-24 flex-shrink-0 rounded bg-gray-100 object-contain"
        />
        <div className="min-w-0">
          <h1 className="font-semibold">{listing.title}</h1>
          <p className="text-sm text-gray-500">{listing.brand ?? "—"}</p>
        </div>
      </div>

      {offers.length === 0 ? (
        <p className="mt-8 text-gray-600">
          No shops are currently listing this product.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {offers.map((offer) => {
            const inStock = offer.availability === "InStock";
            const isCheapest =
              cheapestPrice !== null && offer.price.amount === cheapestPrice;

            return (
              <li
                key={offer.merchantDomain}
                className={`flex items-center gap-4 rounded border p-3 ${
                  inStock ? "border-gray-200" : "border-gray-100 opacity-50"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {offer.merchantDomain}
                </span>

                <span className="whitespace-nowrap">
                  {formatPrice(offer.price)}
                </span>

                {isCheapest && inStock && (
                  <span className="whitespace-nowrap rounded bg-green-100 px-2 py-0.5 text-xs uppercase tracking-wide text-green-800">
                    Cheapest
                  </span>
                )}

                <span className="w-24 text-right text-sm text-gray-500">
                  {inStock ? "In stock" : "Out of stock"}
                </span>

                {inStock ? (
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-black px-3 py-1.5 text-sm text-white"
                  >
                    Buy
                  </a>
                ) : (
                  // Shown but not clickable — hiding it would look like the
                  // merchant doesn't stock the product at all.
                  <span className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-500">
                    Buy
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

function Shell({
  children,
  backHref,
}: {
  children: React.ReactNode;
  backHref: string;
}) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href={backHref} className="text-sm underline">
        ← Back to battle
      </Link>
      {children}
    </main>
  );
}
