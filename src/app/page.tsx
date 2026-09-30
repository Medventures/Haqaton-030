import Link from "next/link";
import type { Metadata } from "next";
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

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="AqylRoute AI — главная">
          <span className={styles.brandMark} aria-hidden="true"><span /></span>
          <span>AqylRoute <span className={styles.brandAi}>AI</span></span>
        </Link>
        <nav aria-label="Главная навигация" className={styles.navigation}>
          <a href="#how-it-works" className={styles.navInfo}>Как это работает</a>
          <Link href="/login" className={styles.navLogin}>Войти <ArrowIcon /></Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.kicker}><span className={styles.kickerDot} /> Помощь семье на каждом шаге</span>
            <h1 id="hero-title">AI-куратор ведёт вас <span>от вопросов до записи</span></h1>
            <p className={styles.heroDescription}>AqylRoute создаёт персональный маршрут помощи ребёнку, находит нужные учреждения и берёт запись на себя. Вы выбираете удобное время и всегда знаете следующий шаг.</p>
            <div className={styles.heroActions}>
              <Link href="/login" className={styles.primaryButton}>Начать маршрут <ArrowIcon /></Link>
              <a href="#how-it-works" className={styles.secondaryLink}>Как это работает <span aria-hidden="true">↓</span></a>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="Пример маршрута из трёх шагов">
            <div className={styles.visualGlow} aria-hidden="true" />
            <div className={styles.routeCard}>
              <div className={styles.routeHeader}>
                <div>
                  <span className={styles.cardEyebrow}>ВАШ ЛИЧНЫЙ МАРШРУТ · ПРИМЕР</span>
                  <h2>Вы видите путь. Куратор помогает пройти его.</h2>
                </div>
                <span className={styles.routeSymbol} aria-hidden="true">↗</span>
              </div>
              <ol className={styles.routeList}>
                <li className={styles.routeItemDone}>
                  <span className={styles.routeNode} aria-hidden="true">✓</span>
                  <div><strong>Рассказать о ситуации</strong><small>Куратор узнаёт, что важно вашей семье</small></div>
                  <span className={styles.doneBadge}>Готово</span>
                </li>
                <li className={styles.routeItemCurrent}>
                  <span className={styles.routeNode} aria-hidden="true"><span /></span>
                  <div><strong>Выбрать место и время</strong><small>Куратор находит подходящие варианты</small></div>
                  <span className={styles.currentBadge}>Текущий шаг</span>
                </li>
                <li>
                  <span className={styles.routeNode} aria-hidden="true" />
                  <div><strong>Получить запись</strong><small>Куратор всё организует за вас</small></div>
                </li>
              </ol>
            </div>
            <div className={styles.visualCaption}>Ваш путь — в одном месте.</div>
          </div>
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
          <Link href="/login" className={styles.primaryButton}>Начать маршрут <ArrowIcon /></Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>AqylRoute AI</span>
        <span>Ваш путь к помощи ребёнку — в одном месте</span>
      </footer>
    </div>
  );
}
