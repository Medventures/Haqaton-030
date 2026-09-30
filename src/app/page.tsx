import Link from "next/link";
import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/supabase/server";
import LoginForm from "./login/login-form";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "AqylRoute AI — ваш AI-куратор",
  description: "AI-куратор создаёт персональный маршрут помощи ребёнку и берёт на себя запись в нужные учреждения.",
};

const steps = [
  {
    number: "01",
    title: "Расскажите о семье",
    text: "Ответьте на несколько вопросов. AI-куратор узнает, какая помощь нужна вашей семье.",
  },
  {
    number: "02",
    title: "Получите личный маршрут",
    text: "AI-куратор составляет план под вашу ситуацию: куда обратиться, что подготовить и когда действовать.",
  },
  {
    number: "03",
    title: "Выберите время — куратор запишет",
    text: "Он находит подходящее учреждение и свободное время, оформляет запись и показывает её в вашем маршруте.",
  },
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
          <Link href={routeHref} className={styles.navLogin}>{profile ? "Мой маршрут" : "Войти"} <ArrowIcon /></Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.kicker}><span className={styles.kickerDot} /> Помощь семье на каждом шаге</span>
            <h1 id="hero-title">AI-куратор ведёт вас <span>от вопросов до записи</span></h1>
            <p className={styles.heroDescription}>AqylRoute создаёт персональный маршрут помощи ребёнку, находит нужные учреждения и берёт запись на себя. Вы выбираете удобное время и всегда знаете следующий шаг.</p>
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

        <section id="how-it-works" className={styles.how} aria-labelledby="how-title">
          <div className={styles.sectionIntro}>
            <span className={styles.sectionKicker}>КАК ЭТО РАБОТАЕТ</span>
            <h2 id="how-title">Меньше забот об организации помощи</h2>
            <p>AI-куратор ведёт семью по маршруту и сам организует запись, когда приходит время следующего шага.</p>
          </div>
          <div className={styles.steps}>
            {steps.map((step) => (
              <article className={styles.step} key={step.number}>
                <span className={styles.stepNumber}>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div>
            <span className={styles.sectionKicker}>AQYLROUTE AI</span>
            <h2 id="closing-title">Начните с одного разговора</h2>
            <p>AI-куратор превращает ваши ответы в понятный маршрут и берёт организацию помощи на себя.</p>
          </div>
          <Link href={routeHref} className={styles.primaryButton}>{routeLabel} <ArrowIcon /></Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>AqylRoute AI</span>
        <span>Ваш путь к помощи ребёнку — в одном месте</span>
      </footer>
    </div>
  );
}
