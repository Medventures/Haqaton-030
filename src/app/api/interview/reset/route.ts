import { createClient, getCurrentProfile } from "@/lib/supabase/server";

// POST only: a GET reset would fire on link prefetch. RLS limits the update to the caller's own row.
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Нужно войти." }, { status: 401 });
  const supabase = await createClient();
  const { error } = await supabase.from("interview_sessions").update({
    answers_json: {},
    status: "draft",
    completed_at: null,
    updated_at: new Date().toISOString(),
  }).eq("parent_id", profile.id);
  if (error) return Response.json({ error: "Не удалось сбросить анкету." }, { status: 500 });
  return new Response(null, { status: 204 });
}
