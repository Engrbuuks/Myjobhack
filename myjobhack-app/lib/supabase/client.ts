import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 * These values are inlined at build time, so a missing variable produces an
 * opaque failure at runtime — we surface it explicitly instead.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured in this build. " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in Vercel " +
      "for the Production environment, and the app redeployed afterwards — " +
      "environment changes do not apply to existing builds."
    );
  }

  return createBrowserClient(url, key);
}
