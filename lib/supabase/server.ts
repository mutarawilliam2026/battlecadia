import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// RLS-RESPECTING Supabase client for Server Components and Server Actions.
// Uses the PUBLISHABLE key (safe for the browser; here it runs server-side but
// carries no elevated privileges) and threads the request's auth cookies so
// that, once login is enabled, `auth.uid()` and every RLS policy apply.
//
// Auth is OFF for this slice, so today this client resolves to an anonymous
// session — it's wired now so the next slice (sign-in, Saved UI) drops in
// without re-plumbing. Battle writes do NOT use this client; they go through
// the secret-key service client (see ./service.ts) which bypasses RLS.
//
// Never trust getSession() in server code — use getClaims()/getUser() when the
// time comes to gate on a real user.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` was called from a Server Component, where cookies are
            // read-only. Safe to ignore when session refresh is handled by a
            // route handler / middleware (to be added with the auth slice).
          }
        },
      },
    },
  );
}
