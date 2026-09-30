"use client";

import { useState } from "react";
import {
  ArrowRight, CalendarDays, Check, CircleCheck, ClipboardList,
  Clock3, FileText, MapPin, Search, Sparkles, Stethoscope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Answers } from "@/lib/interview";
import Interview from "./interview/interview";

const slots = [
  { id: "a", offset: 14, time: "10:00", provider: "Центр развития «Қадам»" },
  { id: "b", offset: 16, time: "14:30", provider: "Центр поддержки «Шуақ»" },
] as const;

type EventState = "done" | "current" | "upcoming";
type RouteEvent = { id: string; offset: number; title: string; text: string; label: string; state: EventState; icon: React.ReactNode; personal?: boolean };

// `today` is a YYYY-MM-DD date from the server, so server and client render the same labels.
function formatDay(today: string, offset: number) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" }).format(date);
}

function relative(offset: number) {
  if (offset === 1) return "Завтра";
  if (offset < 7) return `Через ${offset} ${offset < 5 ? "дня" : "дней"}`;
  if (offset < 30) { const weeks = Math.round(offset / 7); return `Через ${weeks} ${weeks === 1 ? "неделю" : weeks < 5 ? "недели" : "недель"}`; }
  const months = Math.round(offset / 30);
  return `Через ${months} ${months === 1 ? "месяц" : months < 5 ? "месяца" : "месяцев"}`;
}

// ponytail: fixed 10-event route; the agent will build and extend it from Case Plan later.
function routeEvents(completed: boolean, chosen: (typeof slots)[number] | undefined, city: string): RouteEvent[] {
  return [
    { id: "interview", offset: 0, title: "Расскажите о ситуации", icon: "1",
      text: completed ? "Ответы сохранены, агент учёл их в маршруте." : "Ответьте на вопросы справа — агент подберёт шаги под вашу семью.",
      label: completed ? "Готово" : "Сейчас", state: completed ? "done" : "current" },
    { id: "slot", offset: 0, title: chosen ? "Время программы выбрано" : "Выберите время программы", icon: <CalendarDays size={15} />,
      text: chosen ? `${chosen.provider}, ${chosen.time}.` : "Агент нашёл программу ранней помощи и свободные слоты.",
      label: !completed ? "После опроса" : chosen ? "Готово" : "Вместе с агентом", state: !completed ? "upcoming" : chosen ? "done" : "current", personal: completed },
    { id: "pediatrician", offset: 3, title: "Приём у педиатра", icon: <Stethoscope size={15} />,
      text: `Получить направление на ПМПК в поликлинике${completed ? ` (${city})` : ""}.`, label: "Запланировано", state: "upcoming", personal: completed },
    { id: "pmpk-apply", offset: 6, title: "Заявление на ПМПК через eGov", icon: <FileText size={15} />,
      text: "Дату обследования назначат в течение 2 рабочих дней.", label: "Агент напомнит", state: "upcoming" },
    { id: "program", offset: chosen?.offset ?? 14, title: "Первое занятие ранней помощи", icon: <Sparkles size={15} />,
      text: chosen ? `${chosen.provider}, начало в ${chosen.time}.` : "Дата появится после выбора времени.", label: chosen ? "Записаны" : "Ждёт выбора", state: "upcoming", personal: Boolean(chosen) },
    { id: "pmpk-exam", offset: 21, title: "Обследование ПМПК", icon: <ClipboardList size={15} />,
      text: "Возьмите направление, свидетельство о рождении и выписки врачей.", label: "Ожидается", state: "upcoming" },
    { id: "pmpk-result", offset: 28, title: "Заключение ПМПК", icon: <FileText size={15} />,
      text: "Агент обновит маршрут по рекомендациям комиссии.", label: "Ожидается", state: "upcoming" },
    { id: "documents", offset: 45, title: "Документы на коррекционную поддержку", icon: <FileText size={15} />,
      text: "Подготовить пакет по заключению ПМПК.", label: "Следующий этап", state: "upcoming" },
    { id: "review", offset: 90, title: "Промежуточный итог программы", icon: <CircleCheck size={15} />,
      text: "Обсудить прогресс со специалистом и скорректировать план.", label: "Следующий этап", state: "upcoming" },
    { id: "reassessment", offset: 180, title: "Повторная оценка маршрута", icon: <Search size={15} />,
      text: "Агент проверит, какие услуги продолжить и что добавить.", label: "Следующий этап", state: "upcoming" },
  ];
}

function contextFrom(answers: Answers) {
  const residence = answers.RESIDENCE;
  const city = residence && typeof residence === "object" && "city" in residence
    && typeof residence.city === "string" ? residence.city : "вашем городе";
  const age = typeof answers.AGE === "number" && answers.AGE >= 0 && answers.AGE < 18
    ? answers.AGE === 0 ? "до 1 года"
      : `${answers.AGE} ${answers.AGE === 1 ? "год" : answers.AGE < 5 ? "года" : "лет"}`
    : "возраст не указан";
  return { city, age };
}

export default function ParentJourney({ answers, completed, today }: { answers: Answers; completed: boolean; today: string }) {
  const [selectedSlot, setSelectedSlot] = useState<(typeof slots)[number]["id"] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const { city, age } = contextFrom(answers);
  const chosen = slots.find((slot) => slot.id === selectedSlot);
  const events = routeEvents(completed, confirmed ? chosen : undefined, city);

  return <>
    <div className="journey-heading">
      <h2>Ваш маршрут и работа агента</h2>
    </div>

    <div className="journey-grid">
      <Card className="journey-panel route-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon"><ClipboardList size={20} /></span>
            <div><span className="panel-kicker">Ваш план</span><CardTitle>Календарь маршрута</CardTitle></div>
          </div>
          <p>Что можно сделать сегодня и что ждёт семью дальше.</p>
        </CardHeader>
        <CardContent>
          <ol className="route-timeline" aria-label="События маршрута">
            {events.map((event) => <li key={event.id} className={`timeline-step is-${event.state}`}>
              <span className="timeline-node">{event.state === "done" ? <Check size={17} /> : event.icon}</span>
              <div className="timeline-body">
                <span className="timeline-period">{event.offset === 0 ? "Сегодня" : relative(event.offset)} · {formatDay(today, event.offset)}</span>
                <h3>{event.title}</h3>
                <p>{event.text}</p>
                <span className="step-state">{event.label}</span>
                {event.personal && <span className="step-state is-personal"><Sparkles size={12} /> Уточнено агентом</span>}
              </div>
            </li>)}
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
          <Interview initialAnswers={answers} initialCompleted={completed} />
        </CardContent>
      </Card> : <Card className="journey-panel agent-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon agent-icon"><Sparkles size={20} /></span>
            <div><span className="panel-kicker">Работа агента</span><CardTitle>Как найдено предложение</CardTitle></div>
          </div>
          <p>Агент ищет подходящие центры и свободное время, а вы подтверждаете запись.</p>
        </CardHeader>
        <CardContent className="agent-content">
          <div className="context-strip">
            <span>Контекст семьи</span>
            <div><Badge variant="secondary">{age}</Badge><Badge variant="secondary"><MapPin size={12} /> {city}</Badge></div>
          </div>
          <ol className="agent-activity" aria-label="Шаги агента">
            <li><span className="activity-icon"><ClipboardList size={16} /></span><div><strong>Изучил ответы</strong><p>Учитывает возраст, город и этапы, которые семья уже прошла.</p></div><CircleCheck size={17} className="activity-check" /></li>
            <li><span className="activity-icon"><Search size={16} /></span><div><strong>Нашёл программу</strong><p>Пример: программа ранней помощи на октябрь 2026.</p></div><CircleCheck size={17} className="activity-check" /></li>
            <li><span className="activity-icon"><MapPin size={16} /></span><div><strong>Сравнил места</strong><p>Нашёл два подходящих центра в {city}.</p></div><CircleCheck size={17} className="activity-check" /></li>
            <li><span className="activity-icon"><CalendarDays size={16} /></span><div><strong>Проверил расписание</strong><p>Ниже — свободные даты и время.</p></div><CircleCheck size={17} className="activity-check" /></li>
          </ol>

          <div className="agent-offer">
            <div className="offer-topline"><span>Предложение агента</span></div>
            <h3>Программа ранней помощи</h3>
            <p>Выберите удобное время — агент отправит заявку в центр.</p>
            <div className="slot-list" role="radiogroup" aria-label="Время программы">
              {slots.map((slot) => <button key={slot.id} type="button" role="radio"
                aria-checked={selectedSlot === slot.id}
                className={selectedSlot === slot.id ? "slot-option is-selected" : "slot-option"}
                onClick={() => { setSelectedSlot(slot.id); setConfirmed(false); }}>
                <span className="slot-radio" aria-hidden="true" />
                <span><strong>{formatDay(today, slot.offset)} · {slot.time}</strong><small>{slot.provider}</small></span>
                <Clock3 size={16} aria-hidden="true" />
              </button>)}
            </div>
            <Button className="confirm-slot" disabled={!selectedSlot || confirmed} onClick={() => setConfirmed(true)}>
              {confirmed ? <><Check size={16} /> Выбор подтверждён</> : <>Подтвердить выбор <ArrowRight size={16} /></>}
            </Button>
            {confirmed && chosen && <div className="agent-result" role="status">
              <CircleCheck size={20} />
              <div><strong>Ваш выбор добавлен в маршрут</strong>
                <p>{chosen.provider} · {formatDay(today, chosen.offset)} в {chosen.time}. Заявка отправлена в центр.</p></div>
            </div>}
          </div>
        </CardContent>
      </Card>}
    </div>

    {completed && <details className="interview-details">
      <summary><span><ClipboardList size={18} /> Ответы интервью</span><span>Открыть и изменить</span></summary>
      <Interview initialAnswers={answers} initialCompleted={completed} />
    </details>}
  </>;
}
