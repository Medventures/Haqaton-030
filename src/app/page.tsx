import Link from "next/link";
import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/supabase/server";
import LoginForm from "./login/login-form";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "AqylRoute AI — единый маршрут ребёнка с РАС",
  description: "Для родителей детей с РАС и особенностями развития: AI-куратор читает заключение ПМПК, находит центр со свободным временем, записывает ребёнка и следит за программой.",
};

const facts = ["ПМПК → КППК → реабилитация", "Государственный и платный путь", "AI не ставит диагноз"];

const pains = [
  { title: "Сами ищете центр", text: "После ПМПК родитель обзванивает организации и проверяет, есть ли свободные места." },
  { title: "Непонятен следующий шаг", text: "После КППК или реабилитации неясно, когда возвращаться в ПМПК или МСЭ." },
  { title: "Всё держите в голове", text: "Документы, занятия и сроки — только у родителя. Легко потеряться между этапами." },
];

// Mirrors synthetic case C in @src/domain/route/demo-case.ts, so the landing and the demo tell one story.
const exampleRoute = [
  { title: "Консультация специалиста", state: "done" },
  { title: "ПМПК", state: "done", note: "Заключение прочитано" },
  { title: "Кабинет коррекции (КППК)", state: "current", note: "Записан · 5 октября, 11:00" },
  { title: "Индивидуальная программа", state: "upcoming" },
  { title: "Реабилитация по расписанию", state: "upcoming" },
  { title: "Контрольная оценка", state: "upcoming" },
] as const;

const steps = [
  { label: "Документ", title: "Загрузите заключение ПМПК", text: "AI читает документ и показывает, что рекомендовали специалисты. Сам ничего не назначает." },
  { label: "Маршрут", title: "Увидите следующий этап", text: "Например, кабинет психолого-педагогической коррекции. Весь путь ребёнка — на одной странице." },
  { label: "Свободное окно", title: "AI подберёт центр", text: "Сравнит центры по возрасту, нужным услугам и расстоянию и проверит свободное время." },
  { label: "Запись", title: "Подтвердите — AI запишет", text: "Запишет ребёнка на приём, а программу специалиста превратит в расписание на неделю." },
  { label: "Контроль", title: "AI следит за программой", text: "Замечает пропуски, предлагает новое время и напоминает о повторной оценке." },
];

const audiences = [
  { title: "Семья", result: "Меньше хаоса и звонков — больше помощи вовремя", items: [
    "Понятный маршрут: что делать, куда идти, как подготовиться",
    "Подбор центров и запись без обзвона",
    "Напоминания о ПМПК, МСЭ, приёмах и повторной оценке",
  ] },
  { title: "Государство", result: "Прозрачный путь ребёнка и дефицит услуг", items: [
    "Видно, что происходит с ребёнком после получения помощи",
    "Видно, где не хватает услуг, специалистов и мест",
    "Меньше неподготовленных обращений и ручной работы",
  ] },
  { title: "Реабилитационные центры", result: "Понятный спрос и загрузка специалистов", items: [
    "Поток подходящих пациентов из маршрута",
    "Заполнение свободных окон специалистов",
    "Оплата от государства или напрямую от родителей",
  ] },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M3.5 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Home() {
  const profile = await getCurrentProfile();
  const routeHref = profile ? "/parent" : "#login";
  const routeLabel = profile ? "Открыть маршрут" : "Начать маршрут";
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="AqylRoute AI — главная">
          <span className={styles.brandMark} aria-hidden="true"><span /></span>
          <span>AqylRoute <span className={styles.brandAi}>AI</span></span>
        </Link>
        <nav aria-label="Главная навигация" className={styles.navigation}>
          <a href="#how-it-works" className={styles.navInfo}>Как это работает</a>
          <a href="#value" className={styles.navInfo}>Для кого</a>
          <Link href={routeHref} className={styles.navLogin}>{profile ? "Мой маршрут" : "Войти"} <ArrowIcon /></Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.kicker}><span className={styles.kickerDot} /> Для семей после заключения ПМПК</span>
            <h1 id="hero-title">Единый&nbsp;маршрут<br /><span>ребёнка с&nbsp;РАС</span></h1>
            <p className={styles.heroDescription}>Для родителей детей с РАС и другими особенностями развития. AI-куратор читает заключение ПМПК, показывает следующий этап, находит центр со свободным временем и записывает ребёнка — без обзвона организаций.</p>
            <ul className={styles.facts} aria-label="Коротко о сервисе">
              {facts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
            <div className={styles.heroActions}>
              <Link href={routeHref} className={styles.primaryButton}>{routeLabel} <ArrowIcon /></Link>
              <a href="#how-it-works" className={styles.secondaryLink}>Как это работает <span aria-hidden="true">↓</span></a>
            </div>
          </div>

          <section id="login" className={styles.loginPanel} aria-labelledby="login-title">
            <span className={styles.sectionKicker}>ВАШ ЛИЧНЫЙ МАРШРУТ</span>
            {profile ? (
              <>
                <h2 id="login-title">С возвращением{profile.fullName ? `, ${profile.fullName}` : ""}!</h2>
                <p>Ваш маршрут ждёт вас. Продолжите с того шага, на котором остановились.</p>
                <Link href="/parent" className={styles.primaryButton}>Открыть мой маршрут <ArrowIcon /></Link>
              </>
            ) : (
              <>
                <h2 id="login-title">Войдите и начните маршрут</h2>
                <p>Для демо данные родителя уже заполнены. Нажмите «Войти», чтобы открыть маршрут.</p>
                {isSupabaseConfigured() ? <LoginForm /> : (
                  <p className="form-error" role="alert">Вход временно недоступен: сервис не настроен. Администратору нужно задать переменные Supabase (см. README).</p>
                )}
                <p className={styles.loginNote}>Демо работает только с синтетическими аккаунтами. Не вводите данные ребёнка.</p>
              </>
            )}
          </section>
        </section>

        <section className={styles.problem} aria-labelledby="problem-title">
          <div>
            <span className={styles.sectionKicker}>ПРОБЛЕМА</span>
            <h2 id="problem-title">Заключение ПМПК на руках. Что дальше?</h2>
            <p className={styles.problemLead}>Сегодня родитель сам работает диспетчером между ПМПК, кабинетами коррекции, центрами и МСЭ.</p>
            <div className={styles.pains}>
              {pains.map((pain) => (
                <article className={styles.pain} key={pain.title}>
                  <h3>{pain.title}</h3>
                  <p>{pain.text}</p>
                </article>
              ))}
            </div>
          </div>

          <figure className={styles.routeCard} aria-labelledby="route-example-title">
            <figcaption>
              <span className={styles.sectionKicker}>ПРИМЕР МАРШРУТА</span>
              <strong id="route-example-title">Алихан, 6 лет</strong>
              <small>Синтетический пример из демо</small>
            </figcaption>
            <ol className={styles.routeList}>
              {exampleRoute.map((stage) => (
                <li key={stage.title} className={styles[stage.state]}>
                  <span className={styles.routeNode} aria-hidden="true" />
                  <span>{stage.title}{"note" in stage && <small>{stage.note}</small>}</span>
                  <span className="sr-only">{stage.state === "done" ? "пройдено" : stage.state === "current" ? "текущий этап" : "впереди"}</span>
                </li>
              ))}
            </ol>
            <p className={styles.routeAi}>AI-куратор: «Я записал ребёнка в КППК №1. Напомню о визите заранее».</p>
          </figure>
        </section>

        <section id="how-it-works" className={styles.how} aria-labelledby="how-title">
          <div className={styles.sectionIntro}>
            <span className={styles.sectionKicker}>КАК ЭТО РАБОТАЕТ</span>
            <h2 id="how-title">Документ → маршрут → свободное окно → запись → контроль</h2>
            <p>AI не ставит диагноз и не назначает лечение. Он выполняет решения специалистов, а каждую запись делает только после вашего подтверждения.</p>
          </div>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li className={styles.step} key={step.label}>
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")} · {step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="value" className={styles.how} aria-labelledby="value-title">
          <div className={styles.sectionIntro}>
            <span className={styles.sectionKicker}>ДЛЯ КОГО</span>
            <h2 id="value-title">Что получает каждая сторона</h2>
            <p>Больше детей вовремя получают нужную помощь, меньше семей теряются в системе.</p>
          </div>
          <div className={styles.audiences}>
            {audiences.map((audience) => (
              <article className={styles.step} key={audience.title}>
                <h3>{audience.title}</h3>
                <ul className={styles.checks}>
                  {audience.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p className={styles.result}>{audience.result}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div>
            <span className={styles.sectionKicker}>ДЕМО</span>
            <h2 id="closing-title">Меньше хаоса и звонков — больше помощи вовремя</h2>
            <p>Пройдите маршрут на синтетическом примере: от заключения ПМПК до записи в КППК и контроля занятий.</p>
          </div>
          <Link href={routeHref} className={styles.primaryButton}>{routeLabel} <ArrowIcon /></Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>AqylRoute AI</span>
        <span>Единый маршрут ребёнка с РАС — от ПМПК до реабилитации</span>
      </footer>
    </div>
  );
}
