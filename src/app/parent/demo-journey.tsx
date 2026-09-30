"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight, CalendarDays, Check, ChevronDown, CircleCheck, CircleDashed, ClipboardList,
  Clock3, FileText, FileUp, MapPin, RotateCcw, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Answers } from "@/lib/interview";
import {
  STAGES, SERVICE_TITLES, buildSchedule, createSyntheticKppkBooking, findReschedule, matchKppkOptions, weekStats,
  type Appointment, type CenterSlot, type StageId, type StepStatus,
} from "@/domain/route/route";
import {
  child, kppkCenters, kppkNeededServices, kppkSlots, missedSlotId, nextAssessment, pmpkParse, program, weekEnd, weekSlots,
} from "@/domain/route/demo-case";
import { afterPhase, demoRouteState, type DemoPhase } from "@/domain/route/demo-status";
import Interview, { AnswersSummary } from "./interview/interview";

// Screens 1-6 of @.archcore/digital-child-route.prd.md as one walk through case C.
// ponytail: state lives in the tab and resets on reload; persist Case Plan v2 in Supabase when the flow is final.
type Phase = DemoPhase;
const after = afterPhase;

const STATUS_LABELS: Record<StepStatus, string> = {
  NOT_STARTED: "Можно начинать", IN_PROGRESS: "В работе", COMPLETED: "Пройдено",
  DECLINED_BY_PARENT: "Отказ семьи", BLOCKED: "Впереди", OVERDUE: "Просрочено",
};

function formatSlot(at: string, weekday = true) {
  return new Intl.DateTimeFormat("ru-RU", {
    ...(weekday ? { weekday: "short" } : {}), day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }).format(new Date(`${at}:00Z`));
}

function feedFor(phase: Phase, booking: string) {
  const done: string[] = [];
  if (after(phase, "parsed")) done.push("Прочитал заключение ПМПК");
  if (after(phase, "searching")) done.push("Определил следующий этап — КППК");
  if (after(phase, "booked")) done.push(`Записал на ${booking}`);
  if (after(phase, "program")) done.push("КППК пройден", "Индивидуальная программа получена", "Программа добавлена в трекер");
  if (after(phase, "schedule")) done.push("Нашёл свободные слоты специалистов");
  if (after(phase, "scheduled")) done.push("Создал записи на неделю");
  if (after(phase, "control")) done.push("Сверил посещения недели с программой");
  if (after(phase, "rescheduled")) done.push("Перезаписал пропущенное занятие");
  const pending: Record<Phase, string> = {
    upload: "Жду документ от семьи", parsed: "Жду вашей проверки разбора", searching: "Проверяю КППК",
    centers: "Жду подтверждения времени", "booking-check": "Проверяю возможность записи",
    booked: "Ожидаю посещения КППК", program: "Формирую расписание", schedule: "Жду подтверждения записей",
    scheduled: "Слежу за посещениями", control: "Логопед: одно занятие пропущено", rescheduled: "Слежу за выполнением программы",
  };
  return { done, pending: pending[phase] };
}

export default function ParentJourney({ answers, completed }: { answers: Answers; completed: boolean }) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [centerId, setCenterId] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingCandidate, setBookingCandidate] = useState<CenterSlot | null>(null);
  const [kppkBooking, setKppkBooking] = useState<(CenterSlot & { status: "BOOKED" }) | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [openStage, setOpenStage] = useState<StageId | null>(null);

  const residence = answers.RESIDENCE;
  const city = residence && typeof residence === "object" && "city" in residence && typeof residence.city === "string" ? residence.city : null;
  const { steps, current, percent } = demoRouteState(phase, answers, completed);
  const options = matchKppkOptions(kppkCenters, kppkSlots, kppkNeededServices,
    { routeType: "public", paidCurator: false, ageYears: child.ageYears });
  const selected = options.find((option) => option.center.id === centerId);
  const center = selected?.center;
  const kppkSlot = selected?.slot;
  const booking = kppkSlot ? formatSlot(kppkSlot.startsAt, false) : "";
  const hasFreeSlot = options.some((option) => option.slot);
  const searchProblem = options.length === 0
    ? "Подходящих КППК в списке нет. Нужна помощь куратора."
    : !hasFreeSlot ? "У подходящих КППК нет свободного времени. Нужна помощь куратора." : null;
  const schedule = buildSchedule(program.items, weekSlots);
  const stats = weekStats(program.items, appointments);
  const missed = appointments.find((a) => a.status === "MISSED");
  const rebook = missed ? findReschedule(missed, weekSlots, appointments, weekEnd) : null;
  const feed = feedFor(phase, booking);

  useEffect(() => {
    if (phase !== "searching") return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 550;
    const timers = [
      window.setTimeout(() => setSearchProgress(1), delay),
      window.setTimeout(() => setSearchProgress(2), delay * 2),
      window.setTimeout(() => setSearchProgress(3), delay * 3),
      window.setTimeout(() => setPhase("centers"), delay * 4),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [phase]);

  useEffect(() => {
    if (phase !== "booking-check") return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650;
    const timer = window.setTimeout(() => {
      const booked = createSyntheticKppkBooking(kppkCenters, kppkSlots, kppkNeededServices,
        { routeType: "public", paidCurator: false, ageYears: child.ageYears }, bookingCandidate);
      if (booked) {
        setKppkBooking(booked);
        setPhase("booked");
      } else {
        setBookingError("Выбранное время больше не доступно. Выберите другой КППК или повторите поиск.");
        setPhase("centers");
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [phase, bookingCandidate]);

  function startCenterSearch() {
    setCenterId(options[0]?.center.id ?? null);
    setBookingCandidate(null);
    setKppkBooking(null);
    setBookingError(null);
    setSearchProgress(0);
    setPhase("searching");
  }

  async function resetInterview() {
    if (!confirm("Сбросить ответы анкеты?")) return;
    const res = await fetch("/api/interview/reset", { method: "POST" });
    if (res.ok) location.reload();
    else alert("Не удалось сбросить анкету.");
  }

  const nextStep = (() => {
    if (!after(phase, "searching")) return { title: "Загрузить заключение ПМПК", text: "AI-куратор определит следующий этап по документу.", status: "Ждёт документа" };
    if (phase === "searching") return { title: "Подобрать КППК", text: "AI-куратор проверяет организации и время приёма.", status: "Идёт поиск" };
    if (phase === "centers") return { title: "Записаться в КППК", text: searchProblem ?? "Проверьте предложенный кабинет и подтвердите время справа.", status: searchProblem ? "Нужна помощь" : "Ждёт подтверждения" };
    if (phase === "booking-check") return { title: "Записаться в КППК", text: "Проверяю выбранное время перед созданием записи.", status: "Идёт проверка" };
    if (phase === "booked" && center && kppkBooking) return { title: "Первичный приём в КППК", text: `${center.name}, ${center.address}. ${formatSlot(kppkBooking.startsAt, false)}.`, status: "Записан" };
    if (!after(phase, "scheduled")) return { title: "Расписание по программе", text: `Программа ${program.period}: подтвердите записи к специалистам.`, status: "В работе" };
    return { title: "Реабилитация по программе", text: `Следующая контрольная оценка — ${nextAssessment}.`, status: "В работе" };
  })();

  const showCenterSearch = after(phase, "searching");
  const visibleSearchSteps = phase === "searching" ? Math.min(searchProgress + 1, 3) : 3;
  const searchActions = [
    { title: `Проверил список КППК: ${kppkCenters.length} организации`, error: false },
    { title: options.length > 0
      ? `Выбрал ${center?.name ?? options[0].center.name}: ${selected?.covered.length ?? options[0].covered.length} из ${kppkNeededServices.length} нужных услуг`
      : "Не нашёл КППК по возрасту и нужным услугам", error: options.length === 0 },
    { title: kppkSlot
      ? `Проверил расписание: ${booking} в ${center?.name}`
      : hasFreeSlot ? "У выбранного КППК нет свободного времени" : "Свободного времени у подходящих КППК нет",
      error: !kppkSlot },
  ];

  return <>
    <h1 className="sr-only">Мой маршрут</h1>

    <div className="journey-grid">
      <Card className="journey-panel route-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon"><ClipboardList size={20} /></span>
            <CardTitle>Ваш план</CardTitle>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={resetInterview}><RotateCcw size={14} /> Сбросить</Button>
          </div>
          {completed && <div className="route-summary">
            <div className="route-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Маршрут выполнен">
              <span style={{ width: `${percent}%` }} />
            </div>
            <p>Маршрут выполнен на <strong>{percent}%</strong> · Текущий этап: <strong>{STAGES.find((s) => s.id === current)?.title ?? "—"}</strong></p>
          </div>}
        </CardHeader>
        <CardContent>
          {completed && <section className="next-step" aria-label="Следующий шаг">
            <span className="panel-kicker">Следующий шаг</span>
            <h3>{nextStep.title}</h3>
            <p>{nextStep.text}</p>
            <span className="step-state">{nextStep.status}</span>
            {phase === "booked" && <p className="next-step-ai"><Sparkles size={13} /> Я записал ребёнка. Напомню о визите заранее.</p>}
          </section>}

          {completed ? <ol className="route-timeline route-stages" aria-label="Этапы маршрута">
            {steps.map((step) => {
              const state = step.status === "COMPLETED" ? "done" : step.stage === current ? "current"
                : step.stage === "SPECIALIST_CONSULTATION" && step.status === "IN_PROGRESS" ? "reported" : "upcoming";
              const isCompleted = step.status === "COMPLETED";
              const isOpen = openStage === step.stage;
              const stageContent = <>
                <span className="timeline-title">{STAGES.find((s) => s.id === step.stage)!.title}</span>
                <span className="step-state">{step.stage === "SPECIALIST_CONSULTATION" && step.status === "IN_PROGRESS" ? "Со слов семьи" : state === "current" && step.status === "BLOCKED" ? "Текущий этап" : STATUS_LABELS[step.status]}</span>
                {isCompleted && <span className="stage-view-label">{isOpen ? "Скрыть детали" : "Смотреть детали"}<ChevronDown size={15} aria-hidden="true" /></span>}
              </>;
              return <li key={step.stage} className={`timeline-step is-${state}${step.status === "OVERDUE" ? " is-overdue" : ""}`}>
                <span className="timeline-node">{state === "done" ? <Check size={17} /> : state === "current" ? <span className="node-dot" /> : null}</span>
                {isCompleted
                  ? <button type="button" className={`timeline-body${isOpen ? " is-active" : ""}`} aria-expanded={isOpen}
                      aria-controls={`stage-details-${step.stage}`} onClick={() => setOpenStage(isOpen ? null : step.stage)}>{stageContent}</button>
                  : <div className="timeline-body is-static">{stageContent}</div>}
                {isCompleted && <div className="stage-details" id={`stage-details-${step.stage}`} hidden={!isOpen}>
                  <p className="readonly-note">Просмотр завершённого этапа. Изменение данных здесь недоступно.</p>
                  {step.stage === "SPECIALIST_CONSULTATION" && <p>Сведения о консультации пока не добавлены.</p>}
                  {step.stage === "PMPK" && <dl className="stage-facts">
                    <div><dt>Документ</dt><dd>{pmpkParse.type} от {pmpkParse.date}</dd></div>
                    <div><dt>Направление</dt><dd>{pmpkParse.nextRoute}</dd></div>
                    <div><dt>Рекомендации</dt><dd>{[...pmpkParse.specialists, pmpkParse.format].join("; ")}</dd></div>
                  </dl>}
                  {step.stage === "KPPK" && (kppkBooking && center
                    ? <dl className="stage-facts">
                      <div><dt>Кабинет</dt><dd>{center.name}, {center.address}</dd></div>
                      <div><dt>Приём</dt><dd>{formatSlot(kppkBooking.startsAt, false)}</dd></div>
                    </dl>
                    : <p>Сведения о приёме пока не добавлены.</p>)}
                  {step.stage === "INDIVIDUAL_PROGRAM" && <dl className="stage-facts">
                    <div><dt>Автор</dt><dd>{program.author}</dd></div>
                    <div><dt>Период</dt><dd>{program.period}</dd></div>
                    <div><dt>Занятия</dt><dd>{program.items.map((item) => `${SERVICE_TITLES[item.service]} — ${item.perWeek} в неделю`).join("; ")}</dd></div>
                  </dl>}
                  {(step.stage === "REHABILITATION" || step.stage === "CONTROL_ASSESSMENT") && <p>Подробности этапа пока не добавлены.</p>}
                </div>}
              </li>;
            })}
          </ol> : <p className="route-empty">Маршрут появится после завершения анкеты. Пока ни один этап не отмечен как пройденный.</p>}
        </CardContent>
      </Card>

      {!completed ? <Card className="journey-panel interview-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon"><ClipboardList size={20} /></span>
            <div><span className="panel-kicker">Шаг 1</span><CardTitle>Расскажите о ситуации</CardTitle></div>
          </div>
        </CardHeader>
        <CardContent className="agent-content">
          <Interview initialAnswers={answers} />
        </CardContent>
      </Card> : <Card className="journey-panel agent-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon agent-icon"><Sparkles size={20} /></span>
            <CardTitle>AI-куратор</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="agent-content">
          <ol className="agent-activity" aria-label="Действия AI-куратора">
            {feed.done.map((item) => <li key={item}><span className="activity-icon"><CircleCheck size={16} /></span><div><strong>{item}</strong></div></li>)}
            {showCenterSearch && searchActions.slice(0, visibleSearchSteps).map((item, index) => {
              const pending = phase === "searching" && searchProgress <= index;
              return <li key={index} className={pending ? "is-pending" : item.error ? "is-error" : ""}>
                <span className="activity-icon" aria-hidden="true">{pending ? <CircleDashed size={16} /> : item.error ? <Clock3 size={16} /> : <CircleCheck size={16} />}</span>
                <div><strong>{pending ? ["Проверяю список КППК", "Сверяю возраст и услуги", "Проверяю расписание"][index] : item.title}</strong>
                  <p>{pending ? "Проверяю" : item.error ? "Нужна помощь" : "Готово"}</p></div>
              </li>;
            })}
            {phase === "booking-check" && <li className="is-pending"><span className="activity-icon" aria-hidden="true"><CircleDashed size={16} /></span><div><strong>Проверяю выбранное время перед записью</strong><p>Проверяю</p></div></li>}
            {bookingError && phase === "centers" && <li className="is-error"><span className="activity-icon" aria-hidden="true"><Clock3 size={16} /></span><div><strong>Запись не создана</strong><p>{bookingError}</p></div></li>}
            {phase !== "searching" && phase !== "booking-check" && !searchProblem && <li className="is-pending"><span className="activity-icon"><CircleDashed size={16} /></span><div><strong>{feed.pending}</strong></div></li>}
          </ol>
          {showCenterSearch && <p className="sr-only" role="status">{phase === "booking-check" ? "Проверяю возможность записи" : phase === "searching" ? ["Проверяю список КППК", "Сверяю возраст и услуги", "Проверяю расписание", "Проверка завершена"][searchProgress] : bookingError ?? searchProblem ?? "Проверка завершена. Выберите и подтвердите время."}</p>}

          <div className="agent-offer">
            {phase === "upload" && <>
              <div className="offer-topline"><span>Добавить документ</span></div>
              <h3>Загрузите заключение ПМПК</h3>
              <p>Я прочитаю документ и найду следующий этап маршрута. Подойдут PDF или фото.</p>
              {/* ponytail: any file yields the case C parse; real extraction waits for the personal-data decision. */}
              <label className="upload-drop">
                <FileUp size={20} /><span>Выбрать файл</span>
                <input type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => { if (e.target.files?.length) setPhase("parsed"); }} />
              </label>
            </>}

            {phase === "parsed" && <>
              <div className="offer-topline"><span>AI обработал документ</span></div>
              <dl className="answers-summary parse-list">
                <div><dt>Тип</dt><dd>{pmpkParse.type}</dd></div>
                <div><dt>Дата</dt><dd>{pmpkParse.date}</dd></div>
                <div><dt>Направление</dt><dd>{pmpkParse.nextRoute}</dd></div>
                <div><dt>Рекомендации</dt><dd>{[...pmpkParse.specialists, pmpkParse.format].join("; ")}</dd></div>
              </dl>
              <blockquote className="parse-quote"><FileText size={14} /> {pmpkParse.quote}</blockquote>
              <Button className="confirm-slot" onClick={startCenterSearch}>Всё верно — найти КППК <ArrowRight size={16} /></Button>
            </>}

            {phase === "searching" && <>
              <div className="offer-topline"><span>Подбор КППК{city ? ` · ${city}` : ""}</span></div>
              <h3>Ищу подходящий кабинет</h3>
              <p>Проверяю возраст, нужные услуги и время первичного приёма. Результат появится здесь.</p>
            </>}

            {phase === "centers" && <>
              <div className="offer-topline"><span>Подходящие организации{city ? ` · ${city}` : ""}</span></div>
              <h3>{searchProblem ? "Нужно подобрать другой вариант" : "Предлагаю время приёма"}</h3>
              <p>{searchProblem ?? "Сравнил КППК по возрасту, услугам и расстоянию. Выберите подходящий кабинет."}</p>
              <div className="slot-list" aria-label="Кабинеты и время">
                {options.map((option, index) => {
                  const c = option.center;
                  return <button key={c.id} type="button" aria-pressed={centerId === c.id}
                    className={centerId === c.id ? "slot-option is-selected" : "slot-option"} onClick={() => { setCenterId(c.id); setBookingError(null); }}>
                    <span className="slot-radio" aria-hidden="true" />
                    <span><strong>{c.name} · {c.distanceKm.toLocaleString("ru-RU")} км{index === 0 ? " · Рекомендую" : ""}</strong>
                      <small>{c.address} · {option.covered.length} из {option.total} нужных услуг</small>
                      <small>{option.slot ? `Ближайшее время: ${formatSlot(option.slot.startsAt, false)}` : "Свободного времени нет"}</small></span>
                    <MapPin size={16} aria-hidden="true" />
                  </button>;
                })}
              </div>
              {kppkSlot && center && <p className="selected-slot">Предлагаю: <strong>{center.name}, {booking}</strong><br />{center.address}</p>}
              {bookingError && <p className="form-error" role="alert">{bookingError}</p>}
              {hasFreeSlot
                ? <Button className="confirm-slot" disabled={!kppkSlot} onClick={() => { setBookingCandidate(kppkSlot ?? null); setBookingError(null); setPhase("booking-check"); }}>Подтвердить время <ArrowRight size={16} /></Button>
                : <Button className="confirm-slot" variant="outline" onClick={startCenterSearch}>Повторить поиск <RotateCcw size={16} /></Button>}
            </>}

            {phase === "booking-check" && <>
              <div className="offer-topline"><span>Проверка записи</span></div>
              <h3>Проверяю выбранное время</h3>
              <p>{center?.name}, {bookingCandidate && formatSlot(bookingCandidate.startsAt, false)}. После проверки покажу результат записи.</p>
              <Button className="confirm-slot" disabled>Проверяю возможность записи</Button>
            </>}

            {phase === "booked" && <>
              <div className="agent-result" role="status"><CircleCheck size={20} />
                <div><strong>Запись создана</strong><p>{center?.name} · {kppkBooking && formatSlot(kppkBooking.startsAt, false)} · {center?.address}. Статус: записан.</p></div></div>
              <Button className="confirm-slot" variant="outline" onClick={() => setPhase("program")}>Приём в КППК состоялся <Check size={16} /></Button>
            </>}

            {phase === "program" && <>
              <div className="offer-topline"><span>Индивидуальный план · {program.period}</span></div>
              <p>Программу составил {program.author.toLowerCase()}.</p>
              <ul className="program-list">
                {program.items.map((item) => <li key={item.service}><strong>{SERVICE_TITLES[item.service]}</strong>
                  <span>{item.perWeek} раз{item.perWeek > 1 && item.perWeek < 5 ? "а" : ""} в неделю</span></li>)}
              </ul>
              <p>Нашёл доступные слоты для выполнения программы.</p>
              <Button className="confirm-slot" onClick={() => setPhase("schedule")}>Сформировать расписание <CalendarDays size={16} /></Button>
            </>}

            {(phase === "schedule" || phase === "scheduled") && <>
              <div className="offer-topline"><span>Расписание на неделю</span></div>
              <ul className="program-list">
                {schedule.appointments.map((a) => <li key={a.id}><strong>{formatSlot(a.startsAt)}</strong><span>{SERVICE_TITLES[a.service]}</span></li>)}
              </ul>
              {schedule.unplaced.length > 0 && <p className="form-error">Не удалось разместить: {schedule.unplaced.map((u) => `${SERVICE_TITLES[u.service]} — ${u.missing}`).join(", ")}.</p>}
              {phase === "schedule"
                ? <Button className="confirm-slot" onClick={() => { setAppointments(schedule.appointments); setPhase("scheduled"); }}>Подтвердить все записи <Check size={16} /></Button>
                : <>
                  <div className="agent-result" role="status"><CircleCheck size={20} />
                    <div><strong>Создано записей: {schedule.appointments.length}</strong><p>Напомню о каждом занятии заранее.</p></div></div>
                  <Button className="confirm-slot" variant="outline" onClick={() => {
                    setAppointments((list) => list.map((a) => ({ ...a, status: a.id === missedSlotId ? "MISSED" : "ATTENDED" })));
                    setPhase("control");
                  }}>Центр отметил посещения за неделю <Clock3 size={16} /></Button>
                </>}
            </>}

            {(phase === "control" || phase === "rescheduled") && <>
              <div className="offer-topline"><span>Контроль исполнения · эта неделя</span></div>
              <ul className="program-list">
                {stats.map((s) => <li key={s.service}><strong>{SERVICE_TITLES[s.service]}</strong>
                  <span>{s.attended} / {s.planned} {s.attended + s.upcoming >= s.planned ? "✅" : "⚠️"}</span></li>)}
              </ul>
              {missed && <p className="missed-line">🔴 {SERVICE_TITLES[missed.service]} — пропущено ({formatSlot(missed.startsAt)})</p>}
              {phase === "control" && (rebook
                ? <>
                  <p>По индивидуальной программе осталось одно занятие на этой неделе.</p>
                  <Button className="confirm-slot" onClick={() => {
                    setAppointments((list) => [...list, { ...rebook, status: "BOOKED" }]);
                    setPhase("rescheduled");
                  }}>Перезаписать на {formatSlot(rebook.startsAt)} <ArrowRight size={16} /></Button>
                </>
                : <p>На этой неделе свободных слотов нет. Предложу время на следующей неделе.</p>)}
              {phase === "rescheduled" && <div className="agent-result" role="status"><CircleCheck size={20} />
                <div><strong>Новая запись создана</strong><p>{formatSlot(appointments.at(-1)!.startsAt)}. Недельный план будет выполнен.</p></div></div>}
            </>}
          </div>

          <div className="context-strip">
            <span>Карта ребёнка</span>
            <div><Badge variant="secondary">{child.ageYears} лет</Badge>{city && <Badge variant="secondary"><MapPin size={12} /> {city}</Badge>}</div>
          </div>
          <details className="answers-details">
            <summary>Ответы опроса</summary>
            <AnswersSummary answers={answers} />
          </details>
        </CardContent>
      </Card>}
    </div>
  </>;
}
