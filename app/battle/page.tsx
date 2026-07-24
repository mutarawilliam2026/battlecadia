import Link from "next/link";
import { redirect } from "next/navigation";
import { searchProducts } from "@/lib/shopify";
import { formatPrice } from "@/lib/formatPrice";

// RESULTS PAGE (temporary) — /battle?q=...
// Slice 2 replaces this with the battle loop. For now it just lists what the
// Global Catalog search returns so we can eyeball catalog depth and mapping.

// Never prerender — this hits an external API and depends on the query.
export const dynamic = "force-dynamic";

export default async function BattlePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();
  if (!query) redirect("/");

  const { contenders, totalCount } = await searchProducts(query);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/" className="text-sm underline">
        ← New search
      </Link>
      <h1 className="mt-3 text-xl font-semibold">{query}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Showing {contenders.length} of {totalCount} matches in the catalog.
      </p>

      {contenders.length === 0 ? (
        <p className="mt-8 text-gray-600">
          No products came back for that search. Try different words.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {contenders.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-4 rounded border border-gray-200 p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.imageUrl ?? ""}
                alt={c.title}
                width={64}
                height={64}
                className="h-16 w-16 flex-shrink-0 rounded bg-gray-100 object-contain"
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-sm">{formatPrice(c.price)}</p>
                <p className="text-sm text-gray-500">{c.sellerName || "—"}</p>
                {c.features[0] && (
                  <p className="mt-1 truncate text-sm text-gray-600">
                    {c.features[0]}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
