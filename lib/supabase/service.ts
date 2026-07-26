import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// RLS-BYPASSING Supabase client, keyed with the SECRET key. This is the
// service-role equivalent: it ignores every Row-Level Security policy, so it
// must NEVER reach the browser. The `server-only` import above makes importing
// this module from a Client Component a build error, and the key is read from a
// non-NEXT_PUBLIC_ env var so it is never bundled client-side.
//
// This is the ONLY client that reads or writes `battles` and `matchups`: those
// tables have RLS enabled with no client policies (deny-all to anon and
// authenticated), so anonymous battles can be persisted here without ever
// exposing an insert path a browser could abuse.
//
// A fresh client per call is intentional — no session to persist or refresh.
export function createSupabaseServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
