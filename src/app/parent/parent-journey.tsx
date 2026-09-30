"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, FileText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Answers } from "@/lib/interview";
import type { ParentRoute } from "@/domain/parent-route";
import type { RouteState } from "@/server/parent-route-api";
import Interview, { AnswersSummary } from "./interview/interview";
import PmpkPanel from "./pmpk-panel";

const empty: RouteState = { status: "empty", stale: false, plan: null, error: null };
const priorityLabels = { high: "Высокий приоритет", medium: "Средний приоритет", low: "Низкий приоритет" };
const triggerLabels = {
  plan_approved: "после согласования маршрута", self_submitted: "после подачи заявления",
  pmpk_application_submitted: "после подачи заявления в ПМПК через портал",
  pmpk_conclusion_confirmed: "после подтверждения заключения ПМПК", prerequisite_completed: "после выполнения предыдущего шага",
};

function deadlineLabel(deadline: ParentRoute["steps"][number]["deadline"]) {
  if (deadline.kind === "service_duration") return `Длительность услуги: ${deadline.duration.min_days}–${deadline.duration.max_days} дней`;
  const units = deadline.duration.unit === "working_days" ? "рабочих дней" : "календарных дней";
  const prefix = deadline.kind === "internal_target" ? "Внутренний ориентир" : "Срок из справочника";
  return `${prefix}: ${deadline.duration.amount} ${units} ${triggerLabels[deadline.trigger]}.`;
}

export default function ParentJourney({ answers, completed }: { answers: Answers; completed: boolean }) {
  const [state, setState] = useState<RouteState>(empty);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  // Bumped after a reset so the document panel drops everything it holds; bumped again to refetch the route.
  const [epoch, setEpoch] = useState(0);
  const [reload, setReload] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent/route", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Не удалось загрузить маршрут.");
      if (!cancelled) { setState(data); setError(null); }
    }).catch((failure: Error) => { if (!cancelled) setError(failure.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [answers, completed, reload]);

  useEffect(() => {
    if (state.status !== "generating" || pending) return;
    let cancelled = false;
    const timer = setInterval(() => {
      fetch("/api/agent/route", { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? "Не удалось проверить генерацию.");
        if (!cancelled) { setState(data); setError(null); }
      }).catch((failure: Error) => { if (!cancelled) setError(failure.message); });
    }, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [state.status, pending]);

  async function generate() {
    setPending(true); setError(null);
    try {
      const response = await fetch("/api/agent/route", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: Boolean(state.plan) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Не удалось создать маршрут.");
      setState(data);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось создать маршрут."); }
    finally { setPending(false); }
  }

  // A confirmed or removed PMPK document changes what the route may contain.
  const routeInputsChanged = useCallback(() => { setReload((value) => value + 1); if (completed) void generate(); }, [completed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Success is reported only after the server finished deleting both the database rows and the files.
  async function resetAll() {
    if (!window.confirm("Сбросить ответы анкеты, документ ПМПК с файлом и построенный маршрут?")) return;
    setResetting(true); setError(null);
    try {
      const response = await fetch("/api/interview/reset", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Не удалось сбросить данные.");
      }
      setState(empty); setEpoch((value) => value + 1);
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось сбросить данные."); }
    finally { setResetting(false); }
  }

  const plan = completed && !state.stale ? state.plan : null;
  const generating = pending || state.status === "generating";

  return <>
    <h1 className="sr-only">Ваш маршрут и работа агента</h1>
    {/* Submitted by the "Сбросить всё" item in the navbar account menu. */}
    <form id="parent-reset" hidden onSubmit={(event) => { event.preventDefault(); if (!resetting) void resetAll(); }} />
    <div className="journey-grid">
      <Card className="journey-panel route-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon"><ClipboardList size={20} /></span>
            <div><span className="panel-kicker">Ваш план</span><CardTitle>Маршрут поддержки</CardTitle></div>
          </div>
          <p>Шаги из справочника, подобранные по вашим ответам.</p>
        </CardHeader>
        <CardContent>
          {loading ? <p role="status">Загружаем сохранённый маршрут…</p> : plan ?
            <ol className="route-timeline" aria-label="Шаги маршрута">
              {plan.steps.map((step, index) => <li key={step.action_id} className="timeline-step is-upcoming">
                <span className="timeline-node">{index + 1}</span>
                <div className="timeline-body">
                  <span className="timeline-period">{priorityLabels[step.priority]}</span>
                  <h3>{step.title}</h3><p>{step.explanation}</p>
                  <p><strong>Куда обратиться:</strong> {step.agency}</p>
                  <span className="step-state">{step.status === "blocked" ? "Нужны предыдущие шаги или подтверждение" : "Можно начать"}</span>
                  {step.depends_on.length > 0 && <p>Сначала: {step.depends_on.map((id) => plan.steps.find((item) => item.action_id === id)?.title ?? id).join("; ")}.</p>}
                  {step.requirements.map((requirement) => <p key={requirement}>{requirement}.</p>)}
                  {step.documents.length > 0 && <details><summary>Документы</summary><ul>{step.documents.map((document) => <li key={document.document_id}>{document.title}{document.required ? "" : " (при наличии)"}</li>)}</ul></details>}
                  <p>{deadlineLabel(step.deadline)}</p>
                  {step.deadline.source.url && <a href={step.deadline.source.url} target="_blank" rel="noreferrer">Источник правила срока</a>}
                </div>
              </li>)}
            </ol> : <p>{!completed ? "Завершите опрос справа, чтобы подготовить маршрут." : state.stale ? "Ответы изменились. Создайте обновлённый маршрут." : "Маршрут появится после генерации."}</p>}
        </CardContent>
      </Card>
      {!completed ? <Card className="journey-panel interview-panel">
        <CardHeader className="journey-panel-header"><CardTitle>Расскажите о ситуации</CardTitle></CardHeader>
        <CardContent className="agent-content"><Interview initialAnswers={answers} /></CardContent>
      </Card> : <Card className="journey-panel agent-panel">
        <CardHeader className="journey-panel-header">
          <div className="panel-heading"><span className="panel-icon agent-icon"><Sparkles size={20} /></span><CardTitle>Подготовка маршрута</CardTitle></div>
          <p>Агент использует сохранённые ответы и справочник действий.</p>
        </CardHeader>
        <CardContent className="agent-content">
          <ol className="agent-activity" aria-label="Этапы подготовки">
            <li><ClipboardList size={18} /><div><strong>Ответы сохранены</strong><p>Интервью хранится в вашем аккаунте.</p></div><Check size={17} /></li>
            <li><Sparkles size={18} /><div><strong>{generating ? "ИИ-куратор подбирает действия…" : plan ? "Действия подобраны" : "Подобрать действия"}</strong><p>ИИ-куратор выбирает из допустимого списка.</p></div></li>
            <li><FileText size={18} /><div><strong>{plan ? "Маршрут проверен и сохранён" : "Проверить и сохранить"}</strong><p>Сервер проверяет ответ перед сохранением.</p></div></li>
          </ol>
          {plan && <div className="context-strip"><span>Сохранённый маршрут</span><Badge variant="secondary">{plan.steps.length} шагов</Badge><p>Создан {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(plan.generated_at))}</p></div>}
          {(error || state.error) && <p className="form-error" role="alert">{error ?? state.error?.message}</p>}
          <Button className="confirm-slot" disabled={loading || generating} onClick={generate}>
            {generating ? "Подготавливаем маршрут…" : plan ? "Обновить маршрут" : "Создать маршрут"}
          </Button>
          <p className="field-hint">Это предварительный маршрут. Запись в организации и отправка заявлений выполняются отдельно.</p>
        </CardContent>
      </Card>}
    </div>
    <PmpkPanel key={epoch} onRouteInputsChanged={routeInputsChanged} />
    {!completed && error && <p className="form-error" role="alert">{error}</p>}
    {completed && <details className="interview-details"><summary><ClipboardList size={18} /> Ответы интервью</summary><AnswersSummary answers={answers} /><p className="field-hint">Чтобы изменить ответы, выберите «Сбросить всё» в меню пользователя и пройдите интервью заново.</p></details>}
  </>;
}
