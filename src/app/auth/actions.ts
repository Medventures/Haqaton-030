"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Укажите почту и пароль." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Не удалось войти. Проверьте почту и пароль." };

  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id").eq("id", data.user.id).single();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: "Профиль не найден. Проверьте настройку базы данных." };
  }
  redirect("/parent");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
