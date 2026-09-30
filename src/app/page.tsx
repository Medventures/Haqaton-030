import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";

export default async function Home() {
  const profile = await getCurrentProfile();
  redirect(profile ? `/${profile.role}` : "/login");
}
