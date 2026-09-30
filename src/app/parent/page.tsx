import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { getCurrentProfile } from "@/lib/supabase/server";

export default async function ParentPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "parent") redirect("/curator");
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header"><span className="eyebrow">AqylRoute AI</span><form action={signOut}><button className="text-button">Выйти</button></form></header>
      <section className="dashboard-card">
        <span className="role-tag">Родитель</span>
        <h1>Здравствуйте, {profile.fullName || "родитель"}</h1>
        <p>Вы вошли в аккаунт родителя. Эта страница доступна только пользователям с ролью «родитель».</p>
        <dl className="profile-list"><div><dt>Почта</dt><dd>{profile.email}</dd></div><div><dt>Роль в базе</dt><dd>{profile.role}</dd></div></dl>
      </section>
    </main>
  );
}
