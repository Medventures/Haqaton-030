import Link from "next/link";
import { AdminShell, Badge, Icon, PageHeader, SectionHeading, StatCard } from "@/components/admin-ui";

const cases = [
  { name: "Синтетический кейс B", detail: "Астана · маршрут в работе", status: "Просрочено", tone: "red" as const, date: "23 сен", href: "/design/curator/overdue", initial: "B" },
  { name: "Синтетический кейс A", detail: "Алматы · черновик плана", status: "Проверить план", tone: "blue" as const, date: "Сегодня", href: "/design/curator/plan-review", initial: "A" },
  { name: "Пример кейса C", detail: "Алматы · шаг в работе", status: "Скоро срок", tone: "amber" as const, date: "02 окт", href: "/design/curator/overdue", initial: "C" },
];

export default function Home() {
  return <AdminShell active="dashboard">
    <PageHeader eyebrow="Рабочее пространство куратора" title="Обзор кейсов" description="Здесь собраны планы, которым нужно ваше внимание сегодня." action={<span className="date-chip"><Icon name="calendar" /> 30 сентября 2026</span>} />
    <p className="demo-note"><Icon name="info" /> Демонстрационный интерфейс · все кейсы и числа вымышлены</p>
    <div className="stats-grid">
      <StatCard label="Все кейсы" value="12" note="В работе" icon="folder" tone="neutral" />
      <StatCard label="Ждут проверки" value="3" note="Планы AI" icon="spark" tone="blue" href="/design/curator/plan-review" />
      <StatCard label="Скоро срок" value="2" note="В ближайшие 2 дня" icon="clock" tone="amber" />
      <StatCard label="Просрочено" value="2" note="Нужна реакция" icon="alert" tone="red" href="/design/curator/overdue" />
    </div>
    <div className="dashboard-grid">
      <section className="surface cases-panel">
        <SectionHeading title="Кейсы, требующие внимания" description="Сначала просрочки, затем планы на проверку" action={<Link className="text-link" href="/design/curator/overdue">Все просрочки <Icon name="arrow" /></Link>} />
        <div className="case-list">{cases.map((item) => <Link className="case-row" href={item.href} key={item.name}>
          <span className={`case-avatar case-avatar--${item.tone}`}>{item.initial}</span>
          <span className="case-info"><strong>{item.name}</strong><small>{item.detail}</small></span>
          <Badge tone={item.tone}>{item.status}</Badge><span className="case-date">{item.date}</span><Icon name="chevron" />
        </Link>)}</div>
      </section>
      <aside className="dashboard-side">
        <section className="surface focus-panel"><span className="focus-icon"><Icon name="spark" /></span><p className="eyebrow">Следующий шаг</p><h2>Проверьте новый план</h2><p>Черновик готов. После проверки семья увидит свой маршрут.</p><Link className="button button--primary" href="/design/curator/plan-review">Открыть план <Icon name="arrow" /></Link></section>
        <section className="surface activity-panel"><SectionHeading title="Сегодня" /><div className="activity-item"><i className="activity-dot activity-dot--red" /><span><strong>Просрочка шага ПМПК</strong><small>Синтетический кейс B · 09:40</small></span></div><div className="activity-item"><i className="activity-dot activity-dot--blue" /><span><strong>План ждёт проверки</strong><small>Синтетический кейс A · 08:15</small></span></div></section>
      </aside>
    </div>
  </AdminShell>;
}
