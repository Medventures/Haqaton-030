import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const lines = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/);
const env = Object.fromEntries(lines.filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
}));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const accounts = [
  { email: "parent@aqylroute.demo", password: "DemoParent2026!", name: "Демо-родитель" },
];

for (const account of accounts) {
  const { data: existing, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  let user = existing.users.find((candidate) => candidate.email === account.email);
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: account.password, email_confirm: true, user_metadata: { full_name: account.name },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email, password: account.password, email_confirm: true,
      user_metadata: { full_name: account.name },
    });
    if (error) throw error;
    user = data.user;
  }
  const { error: profileError } = await admin.from("profiles").upsert({
    id: user.id, full_name: account.name,
  }, { onConflict: "id" });
  if (profileError) throw profileError;
  console.log(`${account.email} ready`);
}
