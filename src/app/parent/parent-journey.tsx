"use client";

import { useState } from "react";
import {
  ArrowRight, CalendarDays, Check, CircleCheck, CircleDashed, ClipboardList,
  Clock3, FileText, FileUp, MapPin, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Answers } from "@/lib/interview";
import {
  STAGES, SERVICE_TITLES, buildSchedule, currentStage, findReschedule, progress, weekStats,
  type Appointment, type StageId, type Step, type StepStatus,
} from "@/domain/route/route";
import {
  child, initialSteps, kppkCenters, kppkSlots, missedSlotId, nextAssessment, pmpkParse, program, weekEnd, weekSlots,
} from "@/domain/route/demo-case";
import Interview, { AnswersSummary } from "./interview/interview";

// Screens 1-6 of @.archcore/digital-child-route.prd.md as one walk through case C.
// ponytail: state lives in the tab and resets on reload; persist Case Plan v2 in Supabase when the flow is final.
const PHASES = ["upload", "parsed", "centers", "booked", "program", "schedule", "scheduled", "control", "rescheduled"] as const;
type Phase = (typeof PHASES)[number];
const after = (phase: Phase, than: Phase) => PHASES.indexOf(phase) >= PHASES.indexOf(than);

function stepsFor(phase: Phase): Step[] {
  const status: Partial<Record<StageId, StepStatus>> = {};
  if (after(phase, "centers")) Object.assign(status, { PMPK: "COMPLETED", KPPK: "NOT_STARTED" });
  if (after(phase, "booked")) status.KPPK = "IN_PROGRESS";
  if (after(phase, "program")) Object.assign(status, { KPPK: "COMPLETED", INDIVIDUAL_PROGRAM: "COMPLETED", REHABILITATION: "NOT_STARTED" });
  if (after(phase, "scheduled")) Object.assign(status, { REHABILITATION: "IN_PROGRESS", CONTROL_ASSESSMENT: "NOT_STARTED" });
  return initialSteps.map((step) => ({ ...step, status: status[step.stage] ?? step.status }));
}

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
  if (after(phase, "centers")) done.push("Определил следующий этап — КППК", "Нашёл подходящие КППК рядом с домом");
  if (after(phase, "booked")) done.push(`Записал на ${booking}`);
  if (after(phase, "program")) done.push("КППК пройден", "Индивидуальная программа получена", "Программа добавлена в трекер");
  if (after(phase, "schedule")) done.push("Нашёл свободные слоты специалистов");
  if (after(phase, "scheduled")) done.push("Создал записи на неделю");
  if (after(phase, "control")) done.push("Сверил посещения недели с программой");
  if (after(phase, "rescheduled")) done.push("Перезаписал пропущенное занятие");
  const pending: Record<Phase, string> = {
    upload: "Жду документ от семьи", parsed: "Жду вашей проверки разбора", centers: "Жду выбора времени",
    booked: "Ожидаю посещения КППК", program: "Формирую расписание", schedule: "Жду подтверждения записей",
    scheduled: "Слежу за посещениями", control: "Логопед: одно занятие пропущено", rescheduled: "Слежу за выполнением программы",
  };
  return { done, pending: pending[phase] };
}

export default function ParentJourney({ answers, completed }: { answers: Answers; completed: boolean }) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [centerId, setCenterId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const residence = answers.RESIDENCE;
  const city = residence && typeof residence === "object" && "city" in residence && typeof residence.city === "string" ? residence.city : null;
  const steps = stepsFor(phase);
  const current = currentStage(steps);
  const percent = progress(steps);
  const center = kppkCenters.find((c) => c.id === centerId);
  const kppkSlot = kppkSlots.find((s) => s.centerId === centerId);
  const booking = kppkSlot ? formatSlot(kppkSlot.startsAt, false) : "";
  const schedule = buildSchedule(program.items, weekSlots);
  const stats = weekStats(program.items, appointments);
  const missed = appointments.find((a) => a.status === "MISSED");
  const rebook = missed ? findReschedule(missed, weekSlots, appointments, weekEnd) : null;
  const feed = feedFor(phase, booking);

  const nextStep = (() => {
    if (!after(phase, "centers")) return { title: "Загрузить заключение ПМПК", text: "AI-куратор определит следующий этап по документу.", status: "Ждёт документа" };
    if (phase === "centers") return { title: "Записаться в КППК", text: "Выберите кабинет и время справа.", status: "Можно начинать" };
    if (phase === "booked" && center) return { title: "Первичный приём в КППК", text: `${center.name}, ${center.address}. ${booking}.`, status: "Записан" };
    if (!after(phase, "scheduled")) return { title: "Расписание по программе", text: `Программа ${program.period}: подтвердите записи к специалистам.`, status: "В работе" };
    return { title: "Реабилитация по программе", text: `Следующая контрольная оценка — ${nextAssessment}.`, status: "В работе" };
  })();

  return <>
    <h1 className="sr-only">Мой маршрут</h1>

    <div className="journey-grid">
      <Card className="journey-panel route-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon"><ClipboardList size={20} /></span>
            <div><span className="panel-kicker">Мой маршрут</span><CardTitle>{child.name}, {child.ageYears} лет</CardTitle></div>
          </div>
          <div className="route-summary">
            <div className="route-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Маршрут выполнен">
              <span style={{ width: `${percent}%` }} />
            </div>
            <p>Маршрут выполнен на <strong>{percent}%</strong> · Текущий этап: <strong>{STAGES.find((s) => s.id === current)?.title ?? "—"}</strong></p>
          </div>
        </CardHeader>
        <CardContent>
          {completed && <section className="next-step" aria-label="Следующий шаг">
            <span className="panel-kicker">Следующий шаг</span>
            <h3>{nextStep.title}</h3>
            <p>{nextStep.text}</p>
            <span className="step-state">{nextStep.status}</span>
            {phase === "booked" && <p className="next-step-ai"><Sparkles size={13} /> Я записал ребёнка. Напомню о визите заранее.</p>}
          </section>}

          <ol className="route-timeline route-stages" aria-label="Этапы маршрута">
            {steps.map((step) => {
              const state = step.status === "COMPLETED" ? "done" : step.stage === current ? "current" : "upcoming";
              return <li key={step.stage} className={`timeline-step is-${state}${step.status === "OVERDUE" ? " is-overdue" : ""}`}>
                <span className="timeline-node">{state === "done" ? <Check size={17} /> : state === "current" ? <span className="node-dot" /> : null}</span>
                <div className="timeline-body">
                  <span className="timeline-title">{STAGES.find((s) => s.id === step.stage)!.title}</span>
                  <span className="step-state">{state === "current" && step.status === "BLOCKED" ? "Текущий этап" : STATUS_LABELS[step.status]}</span>
                </div>
              </li>;
            })}
          </ol>
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
            <div><span className="panel-kicker">AI-куратор</span><CardTitle>Что я делаю по маршруту</CardTitle></div>
          </div>
          <p>Я выполняю решения специалистов: не ставлю диагноз и не назначаю занятия. Записи создаю только после вашего подтверждения.</p>
        </CardHeader>
        <CardContent className="agent-content">
          <ol className="agent-activity" aria-label="Действия AI-куратора">
            {feed.done.map((item) => <li key={item}><span className="activity-icon"><CircleCheck size={16} /></span><div><strong>{item}</strong></div></li>)}
            <li className="is-pending"><span className="activity-icon"><CircleDashed size={16} /></span><div><strong>{feed.pending}</strong></div></li>
          </ol>

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
              <Button className="confirm-slot" onClick={() => setPhase("centers")}>Всё верно — найти КППК <ArrowRight size={16} /></Button>
            </>}

            {phase === "centers" && <>
              <div className="offer-topline"><span>Подходящие организации{city ? ` · ${city}` : ""}</span></div>
              <h3>Следующий этап найден</h3>
              <p>Кабинеты психолого-педагогической коррекции рядом, с дефектологом и логопедом.</p>
              <div className="slot-list" role="radiogroup" aria-label="Кабинет и время">
                {kppkCenters.map((c) => {
                  const slot = kppkSlots.find((s) => s.centerId === c.id)!;
                  return <button key={c.id} type="button" role="radio" aria-checked={centerId === c.id}
                    className={centerId === c.id ? "slot-option is-selected" : "slot-option"} onClick={() => setCenterId(c.id)}>
                    <span className="slot-radio" aria-hidden="true" />
                    <span><strong>{c.name} · {c.distanceKm.toLocaleString("ru-RU")} км</strong>
                      <small>{c.address} · Подходит по маршруту ✅</small>
                      <small>Ближайшее время: {formatSlot(slot.startsAt, false)}</small></span>
                    <MapPin size={16} aria-hidden="true" />
                  </button>;
                })}
              </div>
              <Button className="confirm-slot" disabled={!centerId} onClick={() => setPhase("booked")}>Записаться через AI <ArrowRight size={16} /></Button>
            </>}

            {phase === "booked" && <>
              <div className="agent-result" role="status"><CircleCheck size={20} />
                <div><strong>Запись создана</strong><p>{center?.name} · {booking}. Статус: записан.</p></div></div>
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
