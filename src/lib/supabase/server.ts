import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

export type Role = "curator" | "parent";
export type CurrentProfile = { id: string; email: string; role: Role; fullName: string | null };

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) return null;
  const { data: profile, error } = await supabase.from("profiles")
    .select("id, role, full_name").eq("id", claimsData.claims.sub).single();
  if (error || !profile || (profile.role !== "parent" && profile.role !== "curator")) return null;
  return {
    id: profile.id,
    email: typeof claimsData.claims.email === "string" ? claimsData.claims.email : "",
    role: profile.role,
    fullName: profile.full_name,
  };
}
