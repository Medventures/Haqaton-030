import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// New client per request: the cache headers from setAll come only once per client.
export async function createClient() {
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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: cookies are read-only there, proxy.ts refreshes the session.
          }
        },
      },
    },
  );
}

export type Role = "curator" | "parent";

export async function getUserRole(): Promise<Role | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.claims.sub)
    .single();
  return (profile?.role as Role) ?? null;
}
