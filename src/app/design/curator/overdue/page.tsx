import Link from "next/link";
import { AdminShell, Badge, Icon, PageHeader, SectionHeading } from "@/components/admin-ui";

export default function OverduePage() {
  return <AdminShell active="overdue"><Link className="back-link" href="/design/curator"><Icon name="back" /> К обзору</Link>
    <PageHeader eyebrow="Контроль сроков" title="Просрочки" description="Шаги, по которым нужна реакция куратора." action={<span className="date-chip"><Icon name="calendar" /> 30 сентября 2026</span>} />
    <p className="demo-note"><Icon name="info" /> Демонстрационный интерфейс · данные вымышлены</p>
    <div className="overdue-hero"><div><Badge tone="red">Требует внимания</Badge><h2>2 шага в очереди</h2><p>Проверьте статус и свяжитесь с семьёй при необходимости.</p></div><span className="stat-icon stat-icon--red"><Icon name="alert" size={22} /></span></div>
    <section className="surface"><SectionHeading title="Очередь просрочек" description="Сначала наиболее ранний срок" /><div className="overdue-list"><article className="overdue-item"><span className="case-avatar case-avatar--red">B</span><div><h3>Получить дату обследования ПМПК</h3><p>Синтетический кейс B · Астана · ожидание внешнего ответа</p><div className="step-meta"><span><Icon name="calendar" size={14} /> Заявление: 21.09.2026</span><span><Icon name="clock" size={14} /> Плановый срок: 23.09.2026</span></div></div><Badge tone="red">Просрочено</Badge></article><article className="overdue-item overdue-item--quiet"><span className="case-avatar case-avatar--amber">C</span><div><h3>Уточнить результат обращения</h3><p>Пример кейса C · демонстрационная запись</p><div className="step-meta"><span><Icon name="clock" size={14} /> Срок: 28.09.2026</span></div></div><Badge tone="amber">Нужна проверка</Badge></article></div></section>
    <div className="overdue-footer"><Icon name="info" /> Действия «Отметить результат» и «Закрыть просрочку» появятся после подключения данных и серверного журнала событий.</div>
  </AdminShell>;
}
