"use server";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { questions, validAnswer, type Answers, type QuestionId } from "@/lib/interview";

async function parentClient() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Доступ к опросу закрыт.");
  return { profile, supabase: await createClient() };
}

export async function saveAnswers(values: Answers) {
  const entries = Object.entries(values) as [QuestionId, unknown][];
  if (entries.length === 0 || !entries.every(([id, value]) => questions.some((question) => question.id === id) && validAnswer(id, value))) {
    return { error: "Проверьте ответ перед продолжением." };
  }
  const { profile, supabase } = await parentClient();
  const { data, error: readError } = await supabase.from("interview_sessions")
    .select("answers_json").eq("parent_id", profile.id).maybeSingle();
  if (readError) return { error: "Не удалось загрузить ответы. Проверьте настройку базы." };
  const answers: Answers = { ...(data?.answers_json as Answers | null ?? {}), ...values };
  const { error } = await supabase.from("interview_sessions").upsert({
    parent_id: profile.id,
    answers_json: answers,
    status: "draft",
    completed_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "parent_id" });
  return { error: error ? "Не удалось сохранить ответ. Попробуйте ещё раз." : null };
}

export async function completeInterview() {
  const { profile, supabase } = await parentClient();
  const { data, error: readError } = await supabase.from("interview_sessions")
    .select("answers_json").eq("parent_id", profile.id).maybeSingle();
  if (readError || !data) return { error: "Не удалось загрузить ответы." };
  const answers = data.answers_json as Answers;
  if (!questions.every(({ id }) => validAnswer(id, answers[id]))) {
    return { error: "Ответьте на все вопросы перед завершением." };
  }
  const { error } = await supabase.from("interview_sessions").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("parent_id", profile.id);
  return { error: error ? "Не удалось завершить опрос. Попробуйте ещё раз." : null };
}
