import Link from "next/link";
import { AdminShell, Badge, Icon, PageHeader, SectionHeading } from "@/components/admin-ui";

const steps = [
  { number: "01", title: "Обратиться к педиатру", detail: "Обсудить запрос семьи и получить направление к профильным специалистам.", agency: "Поликлиника", deadline: "Ориентир: 7 дней", status: "Готов к проверке", tone: "blue" as const },
  { number: "02", title: "Подготовить документы для ПМПК", detail: "Собрать документы, нужные для оценки образовательных потребностей.", agency: "ПМПК", deadline: "Ориентир: 14 дней", status: "Готов к проверке", tone: "blue" as const },
  { number: "03", title: "Обратиться за образовательной поддержкой", detail: "Следующий шаг станет доступен после подтверждения заключения ПМПК.", agency: "Образование", deadline: "После заключения", status: "Заблокировано", tone: "neutral" as const },
];

export default function PlanReviewPage() {
  return <AdminShell active="plan"><Link className="back-link" href="/design/curator"><Icon name="back" /> К обзору</Link>
    <PageHeader eyebrow="Синтетический кейс A · Алматы" title="Проверка плана" description="Сверьте ответы семьи и предложенные шаги до показа маршрута родителю." action={<Badge tone="blue">Ожидает проверки</Badge>} />
    <p className="demo-note"><Icon name="info" /> Макет без сохранения изменений · данные вымышлены</p>
    <div className="detail-grid"><section className="surface detail-panel"><SectionHeading title="Ответы семьи" description="Краткая сводка интервью" /><dl className="definition-list"><div><dt>Возраст ребёнка</dt><dd>2 года 6 месяцев</dd></div><div><dt>Регион</dt><dd>Алматы</dd></div><div><dt>Основной запрос</dt><dd>Понять, какие специалисты и услуги доступны семье</dd></div><div><dt>Этап образования</dt><dd>До дошкольного учреждения</dd></div></dl><hr /><h3>На что обратить внимание</h3><p>План должен объяснять каждый шаг простыми словами. Действия выбираются только из справочника услуг.</p></section>
      <section className="surface detail-panel"><SectionHeading title="Предложенные шаги" description="3 действия из справочника услуг" action={<Badge tone="neutral">Черновик AI</Badge>} /><div className="muted-banner"><Icon name="info" /> Сроки и документы должны приходить из справочника. Здесь показан только дизайн экрана проверки.</div>{steps.map((step) => <article className="step-card" key={step.number}><div className="step-head"><div><span className="step-index">ШАГ {step.number}</span><h3>{step.title}</h3></div><Badge tone={step.tone}>{step.status}</Badge></div><p>{step.detail}</p><div className="step-meta"><span><Icon name="folder" size={14} /> {step.agency}</span><span><Icon name="clock" size={14} /> {step.deadline}</span></div></article>)}<div className="panel-actions"><span className="button button--outline" aria-disabled="true">Вернуть на доработку</span><span className="button button--primary" aria-disabled="true">Утвердить план <Icon name="check" /></span></div></section>
    </div>
  </AdminShell>;
}
