import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import type { CurrentProfile } from "@/lib/supabase/server";

export function Navbar({ profile, children, menu }: { profile: CurrentProfile; children?: React.ReactNode; menu?: React.ReactNode }) {
  const role = "Родитель";

  return <header className="site-navbar">
    <div className="site-navbar-inner">
      <Link className="site-brand" href="/parent">AqylRoute <span>AI</span></Link>
      {children && <nav className="site-nav" aria-label="Основная навигация">{children}</nav>}
      <details className="account-menu">
        <summary aria-label="Меню пользователя">
          <span className="account-avatar" aria-hidden="true">{profile.email.charAt(0).toUpperCase() || role.charAt(0)}</span>
          <span className="account-summary"><strong>{profile.email}</strong><small>{role}</small></span>
          <span className="account-caret" aria-hidden="true">⌄</span>
        </summary>
        <div className="account-dropdown">
          <div className="account-details"><strong>{profile.email}</strong><span>{role}</span></div>
          {menu}
          <form action={signOut}><button type="submit">Выйти</button></form>
        </div>
      </details>
    </div>
  </header>;
}
