import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import DemoJourney from "../demo-journey";
import type { Answers } from "@/lib/interview";

export default async function DemoPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/#login");
  const supabase = await createClient();
  const { data, error } = await supabase.from("interview_sessions").select("answers_json,status").eq("parent_id", profile.id).maybeSingle();
  return <><Navbar profile={profile} /><main className="dashboard-shell">
    <Link href="/parent">Вернуться к моему маршруту</Link>
    <p className="field-hint">Пример сценария с вымышленными организациями и занятиями. Реальная запись не выполняется.</p>
    {error ? <p role="alert">Не удалось загрузить ответы.</p> : <DemoJourney answers={(data?.answers_json ?? {}) as Answers} completed={data?.status === "completed"} />}
  </main></>;
}
