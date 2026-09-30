"use client";

import { useState } from "react";
import {
  ArrowRight, CalendarDays, Check, CircleCheck, ClipboardList,
  Clock3, FileText, MapPin, Search, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Answers } from "@/lib/interview";
import Interview from "./interview/interview";

const slots = [
  { id: "a", day: "14 октября", time: "10:00", provider: "Демо-центр А" },
  { id: "b", day: "16 октября", time: "14:30", provider: "Демо-центр Б" },
] as const;

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

export default function ParentJourney({ answers, completed }: { answers: Answers; completed: boolean }) {
  const [selectedSlot, setSelectedSlot] = useState<(typeof slots)[number]["id"] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const { city, age } = contextFrom(answers);
  const chosen = slots.find((slot) => slot.id === selectedSlot);

  return <>
    <div className="journey-heading">
      <div>
        <span className="journey-eyebrow">Персональный маршрут</span>
        <h2>Что происходит дальше</h2>
        <p>Слева — ваши шаги. Справа — как агент готовит предложение и что вы можете подтвердить.</p>
      </div>
      <Badge variant="outline" className="demo-badge">Демо-сценарий</Badge>
    </div>

    <div className="journey-grid">
      <Card className="journey-panel route-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon"><ClipboardList size={20} /></span>
            <div><span className="panel-kicker">Ваш план</span><CardTitle>Маршрут по шагам</CardTitle></div>
          </div>
          <p>План для примера. После подключения услуг здесь будут реальные действия и сроки.</p>
        </CardHeader>
        <CardContent>
          <ol className="route-timeline">
            <li className={completed ? "timeline-step is-done" : "timeline-step is-current"}>
              <span className="timeline-node">{completed ? <Check size={17} /> : "1"}</span>
              <div className="timeline-body">
                <span className="timeline-period">Сейчас</span>
                <h3>Расскажите о ситуации</h3>
                <p>{completed ? "Ответы интервью сохранены." : "Ответьте на 10 вопросов, чтобы уточнить контекст."}</p>
                <span className="step-state">{completed ? "Готово" : "Текущий шаг"}</span>
              </div>
            </li>
            <li className="timeline-step is-done">
              <span className="timeline-node"><Check size={17} /></span>
              <div className="timeline-body">
                <span className="timeline-period">Подготовка</span>
                <h3>Агент изучает варианты</h3>
                <p>Показывает, какие программы и слоты могут подойти семье.</p>
                <span className="step-state">Пример поиска</span>
              </div>
            </li>
            <li className={confirmed ? "timeline-step is-done" : "timeline-step is-current"}>
              <span className="timeline-node">{confirmed ? <Check size={17} /> : "3"}</span>
              <div className="timeline-body">
                <span className="timeline-period">Октябрь 2026</span>
                <h3>{confirmed ? "Вы выбрали время" : "Выберите удобное время"}</h3>
                <p>{confirmed && chosen
                  ? `${chosen.day}, ${chosen.time} · ${chosen.provider}. Выбор сохранён только на этой странице.`
                  : "Сравните предложенные даты и подтвердите подходящий вариант."}</p>
                <span className="step-state">{confirmed ? "Выбор подтверждён" : "Нужно ваше решение"}</span>
              </div>
            </li>
            <li className="timeline-step is-upcoming">
              <span className="timeline-node"><FileText size={17} /></span>
              <div className="timeline-body">
                <span className="timeline-period">Перед визитом</span>
                <h3>Подготовьте документы</h3>
                <p>После выбора услуги агент покажет список и порядок подготовки.</p>
                <span className="step-state">Следующий этап</span>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card className="journey-panel agent-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon agent-icon"><Sparkles size={20} /></span>
            <div><span className="panel-kicker">Работа агента</span><CardTitle>Как найдено предложение</CardTitle></div>
          </div>
          <p>Это визуализация процесса. Поиск и запись пока не подключены к внешним сервисам.</p>
        </CardHeader>
        <CardContent className="agent-content">
          <div className="context-strip">
            <span>Контекст семьи</span>
            <div><Badge variant="secondary">{age}</Badge><Badge variant="secondary"><MapPin size={12} /> {city}</Badge></div>
          </div>
          <ol className="agent-activity" aria-label="Шаги агента">
            <li><span className="activity-icon"><ClipboardList size={16} /></span><div><strong>Изучил ответы</strong><p>Учитывает возраст, город и этапы, которые семья уже прошла.</p></div><CircleCheck size={17} className="activity-check" /></li>
            <li><span className="activity-icon"><Search size={16} /></span><div><strong>Нашёл программу</strong><p>Пример: программа ранней помощи на октябрь 2026.</p></div><CircleCheck size={17} className="activity-check" /></li>
            <li><span className="activity-icon"><MapPin size={16} /></span><div><strong>Сравнил места</strong><p>Показал два синтетических центра в {city}.</p></div><CircleCheck size={17} className="activity-check" /></li>
            <li><span className="activity-icon"><CalendarDays size={16} /></span><div><strong>Проверил расписание</strong><p>Ниже — пример свободных дат и времени.</p></div><CircleCheck size={17} className="activity-check" /></li>
          </ol>

          <div className="agent-offer">
            <div className="offer-topline"><span>Предложение агента</span><Badge variant="outline">Синтетические данные</Badge></div>
            <h3>Программа ранней помощи</h3>
            <p>Выберите удобный слот. В этом демо выбор не отправляет заявку в центр.</p>
            <div className="slot-list" role="radiogroup" aria-label="Время программы">
              {slots.map((slot) => <button key={slot.id} type="button" role="radio"
                aria-checked={selectedSlot === slot.id}
                className={selectedSlot === slot.id ? "slot-option is-selected" : "slot-option"}
                onClick={() => { setSelectedSlot(slot.id); setConfirmed(false); }}>
                <span className="slot-radio" aria-hidden="true" />
                <span><strong>{slot.day} · {slot.time}</strong><small>{slot.provider}</small></span>
                <Clock3 size={16} aria-hidden="true" />
              </button>)}
            </div>
            <Button className="confirm-slot" disabled={!selectedSlot || confirmed} onClick={() => setConfirmed(true)}>
              {confirmed ? <><Check size={16} /> Выбор подтверждён</> : <>Подтвердить выбор <ArrowRight size={16} /></>}
            </Button>
            {confirmed && chosen && <div className="agent-result" role="status">
              <CircleCheck size={20} />
              <div><strong>Ваш выбор добавлен в маршрут</strong>
                <p>{chosen.provider} · {chosen.day} в {chosen.time}. Реальная запись не выполнена.</p></div>
            </div>}
          </div>
        </CardContent>
      </Card>
    </div>

    <details className="interview-details" open={!completed}>
      <summary><span><ClipboardList size={18} /> Ответы интервью</span><span>Открыть и изменить</span></summary>
      <Interview initialAnswers={answers} initialCompleted={completed} />
    </details>
  </>;
}
