"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileText, FileUp, PencilLine, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  confirmProblem, documentTypeLabels, documentTypes, nextRoutes, PMPK_MAX_BYTES, PMPK_MIME_TYPES, specialistIds,
  specialistLabels, supportFormats, type PmpkFields, type PmpkMime,
} from "@/domain/pmpk";
import { createClient } from "@/lib/supabase/client";
import type { PmpkDocumentState } from "@/server/pmpk-api";
import { call, parseAndRefresh, statusCheckFailed } from "./pmpk-client";

export const nextRouteLabels = { KPPK: "Кабинет психолого-педагогической коррекции", OTHER: "Другое направление" };
export const formatLabels = { individual_development_program: "Индивидуальная развивающая программа", other: "Другой формат" };
const fieldLabels: Record<string, string> = {
  issued_on: "дата выдачи", consultation_on: "дата консультации", next_route: "направление", specialists: "специалисты",
  support_format: "формат поддержки", sessions_per_week: "частота занятий",
};
const problemLabels: Record<string, string> = {
  not_pmpk_conclusion: "Это не заключение ПМПК. Исправьте тип документа или загрузите другой файл.",
  date_required: "В документе не нашлась дата. Укажите дату выдачи или консультации.",
  date_out_of_range: "Даты выглядят неверно. Проверьте их.",
  consultation_after_issue: "Дата консультации не может быть позже даты выдачи.",
};
// The original cannot be replaced by re-running recognition, so these need a new file.
const fileProblems = ["file_missing", "invalid_file", "file_too_large"];

export const formatDate = (value: string) => value.split("-").reverse().join(".");

function emptyFields(): PmpkFields {
  return { document_type: "PMPK_CONCLUSION", issued_on: null, consultation_on: null, issuer: null, next_route: null, specialists: [], support_format: null, sessions_per_week: null };
}

// What the parent reviews: their confirmed values if any, otherwise the model's reading.
export function pickFields(source: PmpkDocumentState): PmpkFields {
  if (source.confirmed) return source.confirmed;
  const found = source.extracted;
  if (!found) return emptyFields();
  return {
    document_type: found.document_type, issued_on: found.issued_on, consultation_on: found.consultation_on, issuer: found.issuer,
    next_route: found.next_route, specialists: found.specialists, support_format: found.support_format, sessions_per_week: found.sessions_per_week,
  };
}

export function recommendations(fields: PmpkFields) {
  return [...fields.specialists.map((id) => specialistLabels[id]), ...(fields.support_format ? [formatLabels[fields.support_format]] : [])];
}

// The parent's one PMPK document as the server sees it. Nothing here is guessed from the last local value.
export function usePmpkDocument() {
  const [document, setDocument] = useState<PmpkDocumentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    call("/api/pmpk").then((data) => { if (!cancelled) setDocument(data.document); })
      .catch(() => { if (!cancelled) { setUnknown(true); setError(statusCheckFailed); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // A document being recognised survives a reload: keep asking the server until it settles.
  const parsing = document?.status === "parsing";
  useEffect(() => {
    if (!parsing) return;
    const timer = setInterval(() => { call("/api/pmpk").then((data) => setDocument(data.document)).catch(() => undefined); }, 3000);
    return () => clearInterval(timer);
  }, [parsing]);

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name); setError(null);
    try { await action(); return true; }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось выполнить действие."); return false; }
    finally { setBusy(null); }
  }

  async function recognise(id: string, action: "parse" | "retry") {
    setBusy("parse");
    const outcome = await parseAndRefresh(id, action);
    if (outcome.known) { setDocument(outcome.document); setUnknown(false); } else setUnknown(true);
    if (outcome.error) throw new Error(outcome.error);
  }

  return {
    document, loading, busy, error, unknown, setError,
    refresh: () => run("refresh", async () => {
      try { setDocument((await call("/api/pmpk")).document); setUnknown(false); }
      catch { setUnknown(true); throw new Error(statusCheckFailed); }
    }),
    upload: (file: File) => run("upload", async () => {
      const created = await call<{ document: PmpkDocumentState; upload: { bucket: string; path: string } }>(
        "/api/pmpk", "POST", { mime_type: file.type as PmpkMime, size_bytes: file.size, consent: true });
      setDocument(created.document);
      const { error: uploadError } = await createClient().storage.from(created.upload.bucket)
        .upload(created.upload.path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error("Не удалось загрузить файл. Удалите документ и попробуйте ещё раз.");
      await recognise(created.document.id, "parse");
    }),
    retry: () => run("parse", () => recognise(document!.id, "retry")),
    confirm: (fields: PmpkFields) => run("confirm", async () => {
      setDocument((await call(`/api/pmpk/${document!.id}/confirm`, "POST", { revision: document!.revision, confirmed: fields })).document);
    }),
    remove: () => run("delete", async () => {
      await call(`/api/pmpk/${document!.id}`, "DELETE");
      setDocument(null);
    }),
  };
}

export type PmpkState = ReturnType<typeof usePmpkDocument>;

// The agent card for the PMPK stage: upload → recognition → the parent's check. `onConfirmed` moves the route on.
export function PmpkOffer({ pmpk, onConfirmed }: { pmpk: PmpkState; onConfirmed: () => void }) {
  const { document, busy } = pmpk;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [fields, setFields] = useState<PmpkFields | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // Take the model's reading once per processing revision, so polling never overwrites the parent's edits.
  const revisionKey = document && (document.status === "needs_review" || document.status === "confirmed") ? `${document.id}:${document.revision}:${document.status}` : null;
  if (revisionKey !== loadedKey) {
    setLoadedKey(revisionKey);
    setFields(revisionKey && document ? pickFields(document) : null); setEditing(false);
  }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(chosen: File | null) {
    pmpk.setError(null); setFile(null); setPreview(null);
    if (!chosen) return;
    if (!(PMPK_MIME_TYPES as readonly string[]).includes(chosen.type)) { pmpk.setError("Нужен файл PDF, PNG или JPEG."); return; }
    if (chosen.size > PMPK_MAX_BYTES) { pmpk.setError("Файл слишком большой. Загрузите файл до 10 МБ."); return; }
    setFile(chosen);
    setPreview(chosen.type.startsWith("image/") ? URL.createObjectURL(chosen) : null);
  }

  async function submit() {
    if (!file || !consent) return;
    if (await pmpk.upload(file)) { setFile(null); setPreview(null); setConsent(false); }
  }

  async function accept() {
    if (!fields) return;
    if (document?.status === "confirmed" && !editing) { onConfirmed(); return; }
    if (await pmpk.confirm(fields)) onConfirmed();
  }

  async function remove() {
    if (!window.confirm("Удалить документ и его файл?")) return;
    await pmpk.remove();
  }

  const errorLine = pmpk.error && <p className="form-error" role="alert">{pmpk.error}</p>;
  const removeButton = (label: string) => <Button variant="ghost" size="sm" disabled={busy !== null} onClick={remove}><Trash2 size={14} /> {label}</Button>;

  if (pmpk.loading) return <><div className="offer-topline"><span>Документ ПМПК</span></div><p role="status">Проверяю, загружен ли документ…</p></>;

  if (pmpk.unknown) return <>
    <div className="offer-topline"><span>Документ ПМПК</span></div>
    <h3>Не удалось проверить документ</h3>
    {errorLine}
    <Button className="confirm-slot" variant="outline" disabled={busy !== null} onClick={() => void pmpk.refresh()}>
      {busy === "refresh" ? "Проверяю…" : "Проверить ещё раз"} <RotateCcw size={16} /></Button>
  </>;

  if (!document) return <>
    <div className="offer-topline"><span>Добавить документ</span></div>
    <h3>Загрузите заключение ПМПК</h3>
    <p>Я прочитаю документ и найду следующий этап маршрута. Подойдут PDF, PNG или JPEG до 10 МБ.</p>
    <label className="upload-drop">
      <FileUp size={20} /><span>{file ? file.name : "Выбрать файл"}</span>
      <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" disabled={busy !== null}
        onChange={(event) => choose(event.target.files?.[0] ?? null)} />
    </label>
    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise */}
    {preview && <img className="pmpk-preview" src={preview} alt="Предпросмотр выбранного документа" />}
    {file && <label className="pmpk-consent">
      <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
      <span>Я согласен(на), чтобы файл хранился в закрытом хранилище моего аккаунта и был отправлен внешнему ИИ-сервису для распознавания. Я могу удалить его в любой момент.</span>
    </label>}
    {errorLine}
    {file && <Button className="confirm-slot" disabled={!consent || busy !== null} onClick={submit}>
      {busy ? "Загружаю и читаю…" : "Разобрать документ"} <ArrowRight size={16} /></Button>}
  </>;

  // The server moves the document to `parsing` during the /parse call; the local copy catches up when it returns.
  if (document.status === "parsing" || busy === "parse") return <>
    <div className="offer-topline"><span>Разбор документа</span></div>
    <h3>Читаю заключение ПМПК</h3>
    <p>Это займёт до минуты. Можно обновить страницу: разбор продолжится.</p>
    <Button className="confirm-slot" disabled>Читаю документ…</Button>
  </>;

  if (document.status === "pending_upload") return <>
    <div className="offer-topline"><span>Загрузка документа</span></div>
    <h3>{busy ? "Загружаю файл" : "Файл не загрузился до конца"}</h3>
    {errorLine}
    {!busy && removeButton("Удалить и начать заново")}
  </>;

  if (document.status === "failed") return <>
    <div className="offer-topline"><span>Разбор документа</span></div>
    <h3>Не удалось прочитать документ</h3>
    <p className="form-error" role="alert">{document.error?.message ?? "Не удалось разобрать документ."}</p>
    {pmpk.error && pmpk.error !== document.error?.message && errorLine}
    {!(document.error && fileProblems.includes(document.error.code))
      && <Button className="confirm-slot" disabled={busy !== null} onClick={() => void pmpk.retry()}>{busy === "parse" ? "Читаю…" : "Повторить разбор"} <RotateCcw size={16} /></Button>}
    <div className="pmpk-actions">{removeButton("Удалить и загрузить другой")}</div>
  </>;

  if (!fields) return null;
  const set = <K extends keyof PmpkFields>(key: K, value: PmpkFields[K]) => setFields((current) => current && ({ ...current, [key]: value }));
  const problem = confirmProblem(fields);
  const confirmed = document.status === "confirmed";
  // One quote behind the recommendation, as the parent needs it to check the reading against the original.
  const quote = ["specialists", "next_route", "support_format"].map((field) => document.extracted?.source_quotes.find((item) => item.field === field)).find(Boolean);
  const dropped = document.extracted?.dropped_fields ?? [];
  const date = fields.issued_on ?? fields.consultation_on;
  const original = document.file_url && <a href={document.file_url} target="_blank" rel="noreferrer">Открыть оригинал</a>;

  if (editing) return <form className="pmpk-form" onSubmit={(event) => { event.preventDefault(); void accept(); }}>
    <div className="offer-topline"><span>Проверьте данные</span>{original}</div>
    {dropped.length > 0 && <p className="field-hint">Не нашёл в документе: {dropped.map((key) => fieldLabels[key] ?? key).join(", ")}. Заполните сами, если это есть в оригинале.</p>}
    <label>Тип документа
      <select value={fields.document_type} onChange={(event) => set("document_type", event.target.value as PmpkFields["document_type"])}>
        {documentTypes.map((type) => <option key={type} value={type}>{documentTypeLabels[type]}</option>)}
      </select>
    </label>
    <div className="pmpk-row">
      <label>Дата консультации<input type="date" value={fields.consultation_on ?? ""} onChange={(event) => set("consultation_on", event.target.value || null)} /></label>
      <label>Дата выдачи<input type="date" value={fields.issued_on ?? ""} onChange={(event) => set("issued_on", event.target.value || null)} /></label>
    </div>
    <label>Организация<input type="text" maxLength={200} value={fields.issuer ?? ""} onChange={(event) => set("issuer", event.target.value || null)} /></label>
    <label>Следующее направление
      <select value={fields.next_route ?? ""} onChange={(event) => set("next_route", (event.target.value || null) as PmpkFields["next_route"])}>
        <option value="">Не указано</option>
        {nextRoutes.map((route) => <option key={route} value={route}>{nextRouteLabels[route]}</option>)}
      </select>
    </label>
    <fieldset><legend>Рекомендованные специалисты</legend>
      {specialistIds.map((id) => <label key={id} className="pmpk-check">
        <input type="checkbox" checked={fields.specialists.includes(id)}
          onChange={(event) => set("specialists", event.target.checked ? [...fields.specialists, id] : fields.specialists.filter((item) => item !== id))} />
        {specialistLabels[id]}
      </label>)}
    </fieldset>
    <label>Формат поддержки
      <select value={fields.support_format ?? ""} onChange={(event) => set("support_format", (event.target.value || null) as PmpkFields["support_format"])}>
        <option value="">Не указан</option>
        {supportFormats.map((format) => <option key={format} value={format}>{formatLabels[format]}</option>)}
      </select>
    </label>
    {problem && <p className="form-error" role="alert">{problemLabels[problem]}</p>}
    {errorLine}
    <Button type="submit" className="confirm-slot" disabled={busy !== null || problem !== null}>
      {busy === "confirm" ? "Сохраняю…" : "Сохранить и найти КППК"} <ArrowRight size={16} /></Button>
    <div className="pmpk-actions">
      <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => { setFields(pickFields(document)); setEditing(false); }}>Отменить</Button>
      {removeButton("Удалить документ")}
    </div>
  </form>;

  return <>
    <div className="offer-topline"><span>{confirmed ? "Подтверждено вами" : "AI обработал документ"}</span>{original}</div>
    <dl className="answers-summary parse-list">
      <div><dt>Тип</dt><dd>{documentTypeLabels[fields.document_type]}</dd></div>
      <div><dt>Дата</dt><dd>{date ? formatDate(date) : "Не нашёл"}</dd></div>
      {fields.issuer && <div><dt>Организация</dt><dd>{fields.issuer}</dd></div>}
      <div><dt>Направление</dt><dd>{fields.next_route ? nextRouteLabels[fields.next_route] : "Не нашёл"}</dd></div>
      <div><dt>Рекомендации</dt><dd>{recommendations(fields).join("; ") || "Не нашёл"}</dd></div>
    </dl>
    {!confirmed && quote && <blockquote className="parse-quote"><FileText size={14} /> {quote.quote}</blockquote>}
    {!confirmed && <p className="field-hint">Проверьте разбор по оригиналу: AI мог ошибиться.</p>}
    {problem && <p className="form-error" role="alert">{problemLabels[problem]}</p>}
    {errorLine}
    <Button className="confirm-slot" disabled={busy !== null || problem !== null} onClick={accept}>
      {busy === "confirm" ? "Сохраняю…" : confirmed ? "Найти КППК" : "Всё верно — найти КППК"} <ArrowRight size={16} /></Button>
    <div className="pmpk-actions">
      <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setEditing(true)}><PencilLine size={14} /> Исправить</Button>
      {removeButton("Удалить")}
    </div>
  </>;
}
