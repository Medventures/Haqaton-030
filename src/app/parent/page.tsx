import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import Interview from "./interview/interview";
import type { Answers } from "@/lib/interview";

export default async function ParentPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "parent") redirect("/curator");
  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase.from("interview_sessions")
    .select("answers_json, status").eq("parent_id", profile.id).maybeSingle();
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header"><span className="eyebrow">AqylRoute AI</span><form action={signOut}><button className="text-button">Выйти</button></form></header>
      <section className="dashboard-card">
        <span className="role-tag">Кабинет родителя</span>
        <h1>Здравствуйте, {profile.fullName || "родитель"}</h1>
        <p>Ответьте на 10 коротких вопросов. Ваши ответы сохраняются после каждого шага.</p>
      </section>
      {sessionError ? <section className="dashboard-card"><p className="form-error" role="alert">Не удалось загрузить опрос. Обновите страницу или проверьте подключение к Supabase.</p></section>
        : <Interview initialAnswers={(session?.answers_json as Answers | null) ?? {}} initialCompleted={session?.status === "completed"} />}
    </main>
  );
}
