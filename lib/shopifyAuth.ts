// ---------------------------------------------------------------------------
// Authenticated access to the Global Catalog. Client credentials from the
// Dev Dashboard Catalog section are exchanged for a short-lived JWT bearer
// token (~60 min). We cache the token and refresh it BEFORE it expires rather
// than fetching one per request, and de-dupe concurrent refreshes.
//
// Token exchange (verified live, from shopify.dev/docs/agents):
//   POST https://api.shopify.com/auth/access_token
//   Content-Type: application/json
//   { client_id, client_secret, grant_type: "client_credentials" }
//   -> { access_token, token_type: "Bearer" }   (no expires_in; exp is in the JWT)
// ---------------------------------------------------------------------------

const TOKEN_ENDPOINT = "https://api.shopify.com/auth/access_token";

// Refresh this long before the JWT's own expiry so a request never carries a
// token that expires in flight.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CachedToken = { token: string; expiresAt: number };

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

/** Read the `exp` (unix seconds) claim from the JWT; fall back to +55 min. */
function tokenExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
    ) as { exp?: number };
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {
    // Unreadable payload — assume a conservative lifetime.
  }
  return Date.now() + 55 * 60 * 1000;
}

async function exchangeCredentials(): Promise<string> {
  const client_id = process.env.SHOPIFY_CLIENT_ID;
  const client_secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error(
      "SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET are not set (see .env.local.example).",
    );
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret, grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Catalog token exchange failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Catalog token exchange returned no access_token.");
  }

  cached = { token: json.access_token, expiresAt: tokenExpiry(json.access_token) };
  return cached.token;
}

/**
 * A valid bearer token for the Global Catalog. Returns the cached token while
 * it's comfortably fresh; otherwise exchanges credentials for a new one.
 * `forceRefresh` discards the cache (used when the catalog rejects a token).
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) cached = null;

  if (cached && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
    return cached.token;
  }

  // Many server requests can need a token at once — share one exchange.
  if (!inflight) {
    inflight = exchangeCredentials().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
