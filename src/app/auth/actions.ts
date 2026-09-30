"use server";

import { redirect } from "next/navigation";
import { createClient, type Role } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedRole = formData.get("role");
  if (!email || !password || (requestedRole !== "parent" && requestedRole !== "curator")) {
    return { error: "Укажите почту, пароль и роль." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Не удалось войти. Проверьте почту и пароль." };

  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("role").eq("id", data.user.id).single();
  if (profileError || !profile || !isRole(profile.role)) {
    await supabase.auth.signOut();
    return { error: "Профиль не найден. Проверьте настройку базы данных." };
  }
  if (profile.role !== requestedRole) {
    await supabase.auth.signOut();
    return { error: "Этот аккаунт принадлежит другой роли." };
  }
  redirect(`/${profile.role}`);
}

function isRole(value: unknown): value is Role {
  return value === "parent" || value === "curator";
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
