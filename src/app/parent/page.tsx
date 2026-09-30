import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import ParentJourney from "./parent-journey";
import type { Answers } from "@/lib/interview";

export default async function ParentPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/#login");
  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase.from("interview_sessions")
    .select("answers_json, status, updated_at").eq("parent_id", profile.id).maybeSingle();
  return (
    <><Navbar profile={profile} /><main className="dashboard-shell">
      {sessionError && <p className="form-error" role="alert">Не удалось загрузить опрос. Обновите страницу или проверьте подключение к Supabase.</p>}
      <p><Link href="/parent/demo">Посмотреть пример маршрута КППК</Link></p>
      <ParentJourney key={session?.updated_at ?? "new"} answers={(session?.answers_json as Answers | null) ?? {}} completed={session?.status === "completed"} />
    </main></>
  );
}
