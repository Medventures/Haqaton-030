import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/supabase/server";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const profile = await getCurrentProfile();
  if (profile) redirect(`/${profile.role}`);
  return (
    <main className="auth-shell">
      <div className="auth-intro">
        <span className="eyebrow">AqylRoute AI</span>
        <h1>Вход в маршрут</h1>
        <p>Выберите роль и войдите в демо-аккаунт. Данные для входа уже заполнены.</p>
      </div>
      {isSupabaseConfigured() ? <LoginForm /> : (
        <p className="form-error" role="alert">Вход временно недоступен: сервис не настроен. Администратору нужно задать переменные Supabase (см. README).</p>
      )}
      <p className="auth-note">Демо работает только с синтетическими аккаунтами. Не вводите данные ребёнка.</p>
    </main>
  );
}
