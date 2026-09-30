import Link from "next/link";
import styles from "./home.module.css";

const steps = [
  {
    number: "01",
    title: "Расскажите о ситуации",
    text: "Ответьте на короткие вопросы. Мы сохраним ответы, чтобы вы могли продолжить позже.",
  },
  {
    number: "02",
    title: "Посмотрите работу агента",
    text: "Агент показывает найденные варианты, даты и следующий шаг для семьи.",
  },
  {
    number: "03",
    title: "Двигайтесь шаг за шагом",
    text: "В маршруте видно, что сделать дальше, куда обратиться и какие документы нужны.",
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
            <span className={styles.kicker}><span className={styles.kickerDot} /> Поддержка семьи на каждом шаге</span>
            <h1 id="hero-title">Понятный маршрут <span>помощи ребёнку</span></h1>
            <p className={styles.heroDescription}>От первых вопросов до конкретных действий. Слева — маршрут семьи, справа — как агент ищет варианты и готовит предложение.</p>
            <div className={styles.heroActions}>
              <Link href="/login" className={styles.primaryButton}>Войти в демо <ArrowIcon /></Link>
              <a href="#how-it-works" className={styles.secondaryLink}>Как это работает <span aria-hidden="true">↓</span></a>
            </div>
            <p className={styles.heroNote}>Демо использует только синтетические данные</p>
          </div>

          <div className={styles.heroVisual} aria-label="Пример маршрута из трёх шагов">
            <div className={styles.visualGlow} aria-hidden="true" />
            <div className={styles.routeCard}>
              <div className={styles.routeHeader}>
                <div>
                  <span className={styles.cardEyebrow}>ПРИМЕР МАРШРУТА</span>
                  <h2>Ваш следующий шаг — ясен</h2>
                </div>
                <span className={styles.routeSymbol} aria-hidden="true">↗</span>
              </div>
              <ol className={styles.routeList}>
                <li className={styles.routeItemDone}>
                  <span className={styles.routeNode} aria-hidden="true">✓</span>
                  <div><strong>Ответить на вопросы</strong><small>Информация для подготовки маршрута</small></div>
                  <span className={styles.doneBadge}>Готово</span>
                </li>
                <li className={styles.routeItemCurrent}>
                  <span className={styles.routeNode} aria-hidden="true"><span /></span>
                  <div><strong>Агент ищет варианты</strong><small>Программа, место и удобное время</small></div>
                  <span className={styles.currentBadge}>Текущий шаг</span>
                </li>
                <li>
                  <span className={styles.routeNode} aria-hidden="true" />
                  <div><strong>Действовать по плану</strong><small>Шаги, документы и сроки в одном месте</small></div>
                </li>
              </ol>
            </div>
            <div className={styles.visualCaption}>Один маршрут. Понятный следующий шаг.</div>
          </div>
        </section>

        <section id="how-it-works" className={styles.how} aria-labelledby="how-title">
          <div className={styles.sectionIntro}>
            <span className={styles.sectionKicker}>КАК ЭТО РАБОТАЕТ</span>
            <h2 id="how-title">От вопросов — к плану действий</h2>
            <p>Простой процесс, в котором семья понимает, что происходит сейчас и что будет дальше.</p>
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
            <h2 id="closing-title">Начните с первого шага</h2>
            <p>Откройте маршрут и посмотрите, как агент готовит предложение для семьи.</p>
          </div>
          <Link href="/login" className={styles.primaryButton}>Войти в демо <ArrowIcon /></Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>AqylRoute AI</span>
        <span>Демонстрационный проект · Без реальных данных детей</span>
      </footer>
    </div>
  );
}
