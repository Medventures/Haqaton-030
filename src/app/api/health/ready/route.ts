import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

// Readiness: the database answers. OpenAI is not checked: saved routes work without it.
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  if (!isSupabaseConfigured()) return Response.json({ status: "unavailable" }, { status: 503, headers: noStore });
  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Anonymous request: RLS returns no rows, but a reply proves Postgres is reachable.
  const { error } = await supabase.from("profiles").select("id").limit(1);
  if (error) {
    console.error("[health] database check failed", error.code);
    return Response.json({ status: "unavailable" }, { status: 503, headers: noStore });
  }
  return Response.json({ status: "ok" }, { headers: noStore });
}
