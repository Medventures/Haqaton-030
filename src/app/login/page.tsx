import { redirect } from "next/navigation";
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
      <LoginForm />
      <p className="auth-note">Демо работает только с синтетическими аккаунтами. Не вводите данные ребёнка.</p>
    </main>
  );
}
