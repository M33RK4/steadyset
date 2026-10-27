import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Only the public (anon / publishable) key is ever used in the browser. The service-role key
// must never be added to this app — account deletion runs through a SECURITY DEFINER function
// that can only delete the caller's own account.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key && /^https?:\/\//.test(url));
}

/** Browser Supabase client, or null when the env vars are missing (guest-only mode). */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!isSupabaseConfigured() || typeof window === "undefined") {
    client = null;
    return client;
  }
  client = createClient(url!, key!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return client;
}
