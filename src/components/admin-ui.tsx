import Link from "next/link";
import type { ReactNode } from "react";
import "./admin.css";

type IconName = "grid" | "folder" | "spark" | "clock" | "alert" | "calendar" | "info" | "arrow" | "chevron" | "check" | "file" | "search" | "bell" | "help" | "back";
const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3V7Z" />,
  spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" /><path d="m19 17 .6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="m12 3 9 16H3l9-16Z" /><path d="M12 9v4m0 3h.01" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m4 12 5 5L20 6" />,
  file: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h4M9 12h6m-6 4h6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  bell: <><path d="M5 18h14l-2-2V10a5 5 0 0 0-10 0v6l-2 2Zm5 3h4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2.5-2.5 4m0 3h.01" /></>,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function AdminShell({ active, children }: { active: "dashboard" | "plan" | "overdue"; children: ReactNode }) {
  const nav: { label: string; href: string; icon: IconName; key: typeof active }[] = [
    { label: "Обзор", href: "/design/curator", icon: "grid", key: "dashboard" },
    { label: "Проверка планов", href: "/design/curator/plan-review", icon: "file", key: "plan" },
    { label: "Просрочки", href: "/design/curator/overdue", icon: "alert", key: "overdue" },
  ];
  return <div className="app-shell"><aside className="sidebar">
    <Link href="/design/curator" className="brand"><span className="brand-mark"><span /></span><span className="brand-copy"><strong>AqylRoute</strong><small>Кабинет куратора</small></span></Link>
    <div className="workspace-switch"><span className="workspace-icon">A</span><span><strong>AqylRoute AI</strong><small>Рабочее пространство</small></span><Icon name="chevron" size={14} /></div>
    <p className="nav-caption">РАБОЧАЯ ОБЛАСТЬ</p>
    <nav aria-label="Основная навигация" className="nav-list">{nav.map((item) => <Link key={item.key} href={item.href} className={`nav-link ${active === item.key ? "nav-link--active" : ""}`} aria-current={active === item.key ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.key === "overdue" && <em>2</em>}</Link>)}</nav>
    <div className="sidebar-bottom"><div className="sidebar-hint"><span className="hint-icon"><Icon name="help" /></span><strong>Нужна помощь?</strong><p>Подсказки по работе с маршрутами появятся здесь.</p></div><div className="profile"><span className="profile-avatar">К</span><span><strong>Куратор</strong><small>Демо-режим</small></span><Icon name="chevron" size={16} /></div></div>
  </aside><div className="main-wrap"><header className="topbar"><div className="breadcrumbs">Рабочее пространство <Icon name="chevron" size={14} /> <strong>{active === "dashboard" ? "Обзор" : active === "plan" ? "Проверка планов" : "Просрочки"}</strong></div><div className="top-actions"><span className="top-search"><Icon name="search" /> Поиск по кейсам <kbd>⌘ K</kbd></span><span className="top-icon"><Icon name="bell" /><i /></span><span className="top-avatar">К</span></div></header><main className="page-content">{children}</main></div></div>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{action && <div>{action}</div>}</div>;
}
export function Badge({ tone, children }: { tone: "red" | "blue" | "amber" | "green" | "neutral"; children: ReactNode }) { return <span className={`badge badge--${tone}`}><span className="badge-dot" />{children}</span>; }
export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>; }
export function StatCard({ label, value, note, icon, tone, href }: { label: string; value: string; note: string; icon: IconName; tone: "red" | "blue" | "amber" | "neutral"; href?: string }) {
  const content = <><span className={`stat-icon stat-icon--${tone}`}><Icon name={icon} size={20} /></span><span className="stat-value">{value}</span><span className="stat-label">{label}</span><span className="stat-note">{note}{href && <Icon name="arrow" size={15} />}</span></>;
  return href ? <Link href={href} className="surface stat-card stat-card--link">{content}</Link> : <div className="surface stat-card">{content}</div>;
}
