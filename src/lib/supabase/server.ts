import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv, isSupabaseConfigured } from "./env";

// New client per request: the cache headers from setAll come only once per client.
export async function createClient() {
  const cookieStore = await cookies();

  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot write cookies; proxy.ts refreshes the session.
          }
        },
      },
    },
  );
}

export type CurrentProfile = { id: string; email: string; fullName: string | null };

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  // Without Supabase nobody can be signed in; the home page explains the configuration error.
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) return null;
  const { data: profile, error } = await supabase.from("profiles")
    .select("id, full_name").eq("id", claimsData.claims.sub).single();
  if (error || !profile) return null;
  return {
    id: profile.id,
    email: typeof claimsData.claims.email === "string" ? claimsData.claims.email : "",
    fullName: profile.full_name,
  };
}
