"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { demoAnswers, questions, services, validAnswer, type Answers, type QuestionId } from "@/lib/interview";
import { completeInterview, saveAnswers } from "./actions";

const choices: Partial<Record<QuestionId, { value: string; label: string }[]>> = {
  COMPLETED_STAGES: [
    { value: "specialists", label: "Консультации специалистов" }, { value: "pmpk", label: "ПМПК" },
    { value: "disability", label: "Оформление инвалидности" }, { value: "rehabilitation", label: "Реабилитационный центр" },
    { value: "none", label: "Ничего из перечисленного" },
  ],
  PMPK_STATUS: [
    { value: "yes", label: "Да" }, { value: "no", label: "Нет" },
    { value: "in_progress", label: "В процессе" }, { value: "unknown", label: "Не знаю" },
  ],
  DISABILITY_STATUS: [
    { value: "yes", label: "Да" }, { value: "no", label: "Нет" },
    { value: "in_progress", label: "Оформляем сейчас" }, { value: "not_planned", label: "Не планируем" },
  ],
  HELP_PREFERENCE: [
    { value: "state", label: "Государственный" }, { value: "private", label: "Частный за свой счёт" },
    { value: "both", label: "Сочетание обоих" }, { value: "unknown", label: "Пока не знаю" },
  ],
  CURRENT_HELP: [
    { value: "none", label: "Нет" }, { value: "state", label: "Да, в государственном центре" },
    { value: "private", label: "Да, в частном центре" }, { value: "other", label: "Другое" },
  ],
  MAIN_PRIORITY: [
    { value: "start", label: "Понять, с чего начать" }, { value: "documents", label: "Оформить документы" },
    { value: "pmpk", label: "Пройти ПМПК" }, { value: "center", label: "Найти центр" },
    { value: "services", label: "Разобраться с доступными услугами" },
    { value: "continue", label: "Продолжить текущий маршрут" },
    { value: "check", label: "Проверить, что ничего не упускаем" },
  ],
};

function PlaceFields({ value, onChange, prefix }: { value: unknown; onChange: (value: { city: string; district: string }) => void; prefix: string }) {
  const place = (value && typeof value === "object" ? value : {}) as { city?: string; district?: string };
  return <div className="place-grid">
    <label htmlFor={`${prefix}-city`}>Город или населённый пункт
      <input id={`${prefix}-city`} maxLength={80} value={place.city ?? ""} onChange={(event) => onChange({ city: event.target.value, district: place.district ?? "" })} />
    </label>
    <label htmlFor={`${prefix}-district`}>Район
      <input id={`${prefix}-district`} maxLength={80} value={place.district ?? ""} onChange={(event) => onChange({ city: place.city ?? "", district: event.target.value })} />
    </label>
    <p className="field-hint">Укажите только город и район. Улицу, дом и личные данные вводить не нужно.</p>
  </div>;
}

export default function Interview({ initialAnswers, initialCompleted }: { initialAnswers: Answers; initialCompleted: boolean }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({ ...demoAnswers, ...initialAnswers });
  const [step, setStep] = useState(() => {
    const first = questions.findIndex(({ id }) => !validAnswer(id, ({ ...demoAnswers, ...initialAnswers })[id]));
    return first < 0 ? questions.length - 1 : first;
  });
  const [completed, setCompleted] = useState(initialCompleted);
  const [editing, setEditing] = useState(!initialCompleted);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const question = questions[step];
  const value = answers[question.id];
  const setValue = (next: unknown) => { setAnswers((current) => ({ ...current, [question.id]: next })); setError(null); };

  function toggle(option: string) {
    const current = Array.isArray(value) ? value as string[] : [];
    if (option === "none") return setValue(["none"]);
    setValue(current.includes(option) ? current.filter((item) => item !== option) : [...current.filter((item) => item !== "none"), option]);
  }

  function advance() {
    if (!validAnswer(question.id, value)) { setError("Выберите или заполните ответ."); return; }
    startTransition(async () => {
      try {
        // Prefilled answers are saved together with the first answer the parent gives.
        const saved = await saveAnswers(Object.fromEntries(questions.slice(0, step + 1).map(({ id }) => [id, answers[id]])));
        if (saved.error) { setError(saved.error); return; }
        if (step < questions.length - 1) { setStep(step + 1); return; }
        const result = await completeInterview();
        if (result.error) { setError(result.error); return; }
        setCompleted(true);
        setEditing(false);
        router.refresh();
      } catch { setError("Не удалось сохранить ответ. Попробуйте ещё раз."); }
    });
  }

  if (completed && !editing) return <section className="dashboard-card interview-done">
    <span className="role-tag">10 из 10 вопросов</span>
    <h2>Ответы сохранены</h2>
    <p>Откройте маршрут выше. При изменении ответов контекст обновится после завершения опроса.</p>
    <button className="secondary-button" type="button" onClick={() => { setStep(0); setEditing(true); }}>Изменить ответы</button>
  </section>;

  let control;
  if (question.id === "AGE") control = <label htmlFor="age">Возраст в полных годах
    <input id="age" type="number" min={0} max={17} inputMode="numeric" value={typeof value === "number" ? value : ""} onChange={(event) => setValue(event.target.value === "" ? undefined : Number(event.target.value))} />
  </label>;
  else if (question.id === "RESIDENCE") control = <PlaceFields value={value} onChange={setValue} prefix="residence" />;
  else if (question.id === "REGISTRATION") {
    const registration = (value && typeof value === "object" ? value : {}) as { same?: boolean; place?: { city: string; district: string } };
    control = <div className="answer-list">
      <button type="button" className={registration.same === true ? "answer-option selected" : "answer-option"} onClick={() => setValue({ same: true })}>Совпадает с местом проживания</button>
      <button type="button" className={registration.same === false ? "answer-option selected" : "answer-option"} onClick={() => setValue({ same: false, place: registration.place ?? { city: "", district: "" } })}>Другой город или район</button>
      {registration.same === false && <PlaceFields value={registration.place} onChange={(place) => setValue({ same: false, place })} prefix="registration" />}
    </div>;
  } else {
    const options = question.id === "CURRENT_SERVICES" ? [...services.map(({ id, label }) => ({ value: id, label })), { value: "none", label: "Пока не получает услуги из списка" }] : choices[question.id] ?? [];
    const isMultiple = question.id === "COMPLETED_STAGES" || question.id === "CURRENT_SERVICES";
    control = <div className="answer-list" role="group" aria-label={question.title}>
      {options.map((option) => {
        const selected = isMultiple ? (Array.isArray(value) ? value.includes(option.value) : value === "none" && option.value === "none") : value === option.value;
        return <button key={option.value} type="button" aria-pressed={selected} className={selected ? "answer-option selected" : "answer-option"}
          onClick={() => isMultiple ? (question.id === "CURRENT_SERVICES" && option.value === "none" ? setValue("none") : toggle(option.value)) : setValue(option.value)}>
          <span aria-hidden="true" className="option-marker">{selected ? "✓" : ""}</span>{option.label}
        </button>;
      })}
      {isMultiple && <p className="field-hint">Можно выбрать несколько вариантов.</p>}
    </div>;
  }

  return <section className="dashboard-card interview-card" aria-labelledby="question-title">
    <p className="demo-prefill-note">Часть ответов заполнена по вашему профилю — осталось ответить на последние вопросы.</p>
    <div className="interview-progress"><span>Вопрос {step + 1} из {questions.length}</span><span>{Math.round((step / questions.length) * 100)}%</span></div>
    <progress value={step} max={questions.length} aria-label="Прогресс опроса" />
    <h2 id="question-title">{question.title}</h2>
    <p className="question-reason">{question.reason}</p>
    {control}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="interview-actions">
      <button type="button" className="secondary-button" disabled={step === 0 || pending} onClick={() => { setStep(step - 1); setError(null); }}>Назад</button>
      <button type="button" className="primary-button" disabled={pending} onClick={advance}>{pending ? "Сохраняем…" : step === questions.length - 1 ? "Завершить опрос" : "Сохранить и дальше"}</button>
    </div>
  </section>;
}
