"use client";

import { useActionState, useState } from "react";
import { signIn, type LoginState } from "@/app/auth/actions";
import type { Role } from "@/lib/supabase/server";

const accounts = {
  parent: { label: "Родитель", email: "parent@aqylroute.demo", password: "DemoParent2026!" },
  curator: { label: "Куратор", email: "curator@aqylroute.demo", password: "DemoCurator2026!" },
} as const;
const initialState: LoginState = { error: null };

export default function LoginForm() {
  const [role, setRole] = useState<Role>("parent");
  const [email, setEmail] = useState<string>(accounts.parent.email);
  const [password, setPassword] = useState<string>(accounts.parent.password);
  const [state, formAction, pending] = useActionState(signIn, initialState);
  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    setEmail(accounts[nextRole].email);
    setPassword(accounts[nextRole].password);
  }
  return (
    <form action={formAction} className="auth-card">
      <div className="role-picker" aria-label="Тип пользователя">
        {(["parent", "curator"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={role === item}
            className={role === item ? "role-button active" : "role-button"}
            onClick={() => chooseRole(item)}>{accounts[item].label}</button>
        ))}
      </div>
      <input type="hidden" name="role" value={role} />
      <label htmlFor="email">Электронная почта</label>
      <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="password">Пароль</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button type="submit" className="primary-button" disabled={pending}>
        {pending ? "Входим…" : `Войти как ${role === "parent" ? "родитель" : "куратор"}`}
      </button>
    </form>
  );
}
