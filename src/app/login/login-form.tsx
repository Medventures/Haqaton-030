"use client";

import { useActionState, useState } from "react";
import { signIn, type LoginState } from "@/app/auth/actions";

const demoAccount = { email: "parent@aqylroute.demo", password: "DemoParent2026!" };
const initialState: LoginState = { error: null };

export default function LoginForm() {
  const [email, setEmail] = useState<string>(demoAccount.email);
  const [password, setPassword] = useState<string>(demoAccount.password);
  const [state, formAction, pending] = useActionState(signIn, initialState);
  return (
    <form action={formAction} className="auth-card">
      <label htmlFor="email">Электронная почта</label>
      <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="password">Пароль</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button type="submit" className="primary-button" disabled={pending}>
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
