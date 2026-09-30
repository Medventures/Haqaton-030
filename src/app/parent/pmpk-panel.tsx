"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  documentTypeLabels, documentTypes, nextRoutes, PMPK_MAX_BYTES, PMPK_MIME_TYPES, specialistIds, specialistLabels,
  supportFormats, type PmpkFields, type PmpkMime,
} from "@/domain/pmpk";
import { createClient } from "@/lib/supabase/client";
import type { PmpkDocumentState } from "@/server/pmpk-api";
import { call, parseAndRefresh, statusCheckFailed } from "./pmpk-client";

const nextRouteLabels = { KPPK: "КППК (кабинет психолого-педагогической коррекции)", OTHER: "Другое направление" };
const formatLabels = { individual_development_program: "Индивидуальная развивающая программа", other: "Другой формат" };
const fieldLabels: Record<string, string> = {
  issued_on: "дата выдачи", consultation_on: "дата консультации", next_route: "направление", specialists: "специалисты",
  support_format: "формат поддержки", sessions_per_week: "частота занятий",
};
// The original cannot be replaced by re-running recognition, so these need a new file.
const fileProblems = ["file_missing", "invalid_file", "file_too_large"];

function emptyFields(): PmpkFields {
  return { document_type: "PMPK_CONCLUSION", issued_on: null, consultation_on: null, issuer: null, next_route: null, specialists: [], support_format: null, sessions_per_week: null };
}

// What the form starts from: the parent's confirmed values if any, otherwise the model's reading.
function pickFields(source: PmpkDocumentState): PmpkFields {
  if (source.confirmed) return source.confirmed;
  const found = source.extracted;
  if (!found) return emptyFields();
  return {
    document_type: found.document_type, issued_on: found.issued_on, consultation_on: found.consultation_on, issuer: found.issuer,
    next_route: found.next_route, specialists: found.specialists, support_format: found.support_format, sessions_per_week: found.sessions_per_week,
  };
}

export default function PmpkPanel({ onRouteInputsChanged }: { onRouteInputsChanged: () => void }) {
  const [document, setDocument] = useState<PmpkDocumentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [fields, setFields] = useState<PmpkFields>(emptyFields);
  const [editing, setEditing] = useState(false);
  // True when the server could not tell us the document's state; never guess it from the last local value.
  const [unknown, setUnknown] = useState(false);
  const loadedRevision = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    call("/api/pmpk").then((data) => { if (!cancelled) setDocument(data.document); })
      .catch(() => { if (!cancelled) { setUnknown(true); setError(statusCheckFailed); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    await run("refresh", async () => {
      try { setDocument((await call("/api/pmpk")).document); setUnknown(false); }
      catch { setUnknown(true); throw new Error(statusCheckFailed); }
    });
  }

  // Shows what the server says after a parse attempt, including `failed` (retry) and `parsing` (keep polling).
  async function recognise(id: string, action: "parse" | "retry") {
    setBusy("parse");
    const outcome = await parseAndRefresh(id, action);
    if (outcome.known) { setDocument(outcome.document); setUnknown(false); }
    else setUnknown(true);
    setError(outcome.error);
  }

  // A document being recognised survives a reload: keep asking the server until it settles.
  const parsing = document?.status === "parsing";
  useEffect(() => {
    if (!parsing) return;
    const timer = setInterval(() => {
      call("/api/pmpk").then((data) => setDocument(data.document)).catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [parsing]);

  // Fill the form once per processing revision, so polling never overwrites the parent's edits.
  useEffect(() => {
    if (!document || document.status !== "needs_review") return;
    const key = `${document.id}:${document.revision}`;
    if (loadedRevision.current === key) return;
    loadedRevision.current = key;
    setFields(pickFields(document)); setEditing(true);
  }, [document]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(chosen: File | null) {
    setError(null); setFile(null); setPreview(null);
    if (!chosen) return;
    if (!(PMPK_MIME_TYPES as readonly string[]).includes(chosen.type)) { setError("Нужен файл PDF, PNG или JPEG."); return; }
    if (chosen.size > PMPK_MAX_BYTES) { setError("Файл слишком большой. Загрузите файл до 10 МБ."); return; }
    setFile(chosen);
    setPreview(chosen.type.startsWith("image/") ? URL.createObjectURL(chosen) : null);
  }

  async function run<T>(name: string, action: () => Promise<T>) {
    setBusy(name); setError(null);
    try { return await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось выполнить действие."); }
    finally { setBusy(null); }
  }

  async function submit() {
    if (!file || !consent) return;
    await run("upload", async () => {
      const created = await call<{ document: PmpkDocumentState; upload: { bucket: string; path: string } }>(
        "/api/pmpk", "POST", { mime_type: file.type as PmpkMime, size_bytes: file.size, consent: true });
      setDocument(created.document);
      const { error: uploadError } = await createClient().storage.from(created.upload.bucket)
        .upload(created.upload.path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error("Не удалось загрузить файл. Удалите документ и попробуйте ещё раз.");
      setFile(null); setPreview(null); setConsent(false);
      await recognise(created.document.id, "parse");
    });
  }

  async function retry() {
    if (!document) return;
    await run("parse", () => recognise(document.id, "retry"));
  }

  async function confirm() {
    if (!document) return;
    await run("confirm", async () => {
      const result = await call(`/api/pmpk/${document.id}/confirm`, "POST", { revision: document.revision, confirmed: fields });
      setDocument(result.document); setEditing(false);
      onRouteInputsChanged();
    });
  }

  async function remove() {
    if (!document || !window.confirm("Удалить документ и его файл?")) return;
    await run("delete", async () => {
      await call(`/api/pmpk/${document.id}`, "DELETE");
      setDocument(null); loadedRevision.current = null; setEditing(false);
      onRouteInputsChanged();
    });
  }

  const set = <K extends keyof PmpkFields>(key: K, value: PmpkFields[K]) => setFields((current) => ({ ...current, [key]: value }));
  const quotes = document?.extracted?.source_quotes ?? [];
  const dropped = document?.extracted?.dropped_fields ?? [];
  const isPmpk = fields.document_type === "PMPK_CONCLUSION";

  return <Card className="journey-panel pmpk-panel">
    <CardHeader className="journey-panel-header">
      <div className="panel-heading"><span className="panel-icon"><FileText size={20} /></span>
        <div><span className="panel-kicker">Документ</span><CardTitle>Заключение ПМПК</CardTitle></div>
      </div>
      <p>Загрузите заключение: агент прочитает его, а вы проверите результат. Пока вы не подтвердите, маршрут не меняется.</p>
    </CardHeader>
    <CardContent className="agent-content pmpk-content">
      {loading ? <p role="status">Загружаем документ…</p> : unknown ? <div>
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={refresh}>{busy === "refresh" ? "Проверяем…" : "Проверить состояние"}</Button>
      </div> : !document ? <div className="pmpk-upload">
        <label className="pmpk-file">
          <Upload size={18} /> <span>{file ? file.name : "Выбрать PDF, PNG или JPEG (до 10 МБ)"}</span>
          <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
        </label>
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise */}
        {preview && <img className="pmpk-preview" src={preview} alt="Предпросмотр выбранного документа" />}
        {file && !preview && <p className="field-hint">PDF: {file.name}, {(file.size / 1024 / 1024).toFixed(1)} МБ.</p>}
        <label className="pmpk-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>Я согласен(на), чтобы файл хранился в закрытом хранилище моего аккаунта и был отправлен в OpenAI для распознавания. Я могу удалить его в любой момент.</span>
        </label>
        <Button className="confirm-slot" disabled={!file || !consent || busy !== null} onClick={submit}>
          {busy ? "Загружаем и разбираем…" : "Разобрать документ"}
        </Button>
      </div> : document.status === "pending_upload" ? <div>
        <p role="status">{busy ? "Загружаем файл…" : "Файл не был загружен до конца."}</p>
        {!busy && <Button variant="outline" size="sm" onClick={remove}><Trash2 size={14} /> Удалить и начать заново</Button>}
      </div> : document.status === "parsing" ? <p role="status">Агент читает документ. Можно обновить страницу: разбор продолжится.</p>
      : document.status === "failed" ? <div>
        <p className="form-error" role="alert">{document.error?.message ?? "Не удалось разобрать документ."}</p>
        <div className="pmpk-actions">
          {!(document.error && fileProblems.includes(document.error.code)) && <Button disabled={busy !== null} onClick={retry}>Повторить разбор</Button>}
          <Button variant="outline" disabled={busy !== null} onClick={remove}><Trash2 size={14} /> Удалить и загрузить другой</Button>
        </div>
      </div> : document.status === "confirmed" && !editing ? <div>
        <div className="context-strip"><span><CheckCircle2 size={14} /> Подтверждено вами</span><Badge variant="secondary">{documentTypeLabels[document.confirmed?.document_type ?? "OTHER"]}</Badge></div>
        <dl className="answers-summary">
          {document.confirmed?.consultation_on && <div><dt>Дата консультации</dt><dd>{document.confirmed.consultation_on}</dd></div>}
          {document.confirmed?.issued_on && <div><dt>Дата выдачи</dt><dd>{document.confirmed.issued_on}</dd></div>}
          {document.confirmed?.next_route && <div><dt>Следующий этап</dt><dd>{nextRouteLabels[document.confirmed.next_route]}</dd></div>}
          {document.confirmed && document.confirmed.specialists.length > 0 && <div><dt>Рекомендованы</dt><dd>{document.confirmed.specialists.map((id) => specialistLabels[id]).join(", ")}</dd></div>}
        </dl>
        <p className="field-hint">Программа занятий и их частота создаются специалистом КППК, а не по этому заключению.</p>
        <div className="pmpk-actions">
          {document.file_url && <a className="secondary-button" href={document.file_url} target="_blank" rel="noreferrer">Открыть оригинал</a>}
          <Button variant="outline" onClick={() => { setFields(pickFields(document)); setEditing(true); }}>Изменить</Button>
          <Button variant="ghost" disabled={busy !== null} onClick={remove}><Trash2 size={14} /> Удалить</Button>
        </div>
      </div> : <form className="pmpk-form" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
        <div className="context-strip"><span>Проверьте данные — агент мог ошибиться</span>
          {document.file_url && <a href={document.file_url} target="_blank" rel="noreferrer">Открыть оригинал</a>}</div>
        {dropped.length > 0 && <p className="field-hint">Не нашли в документе: {dropped.map((key) => fieldLabels[key] ?? key).join(", ")}. Заполните сами, если это есть в оригинале.</p>}
        <label>Тип документа
          <select value={fields.document_type} onChange={(event) => set("document_type", event.target.value as PmpkFields["document_type"])}>
            {documentTypes.map((type) => <option key={type} value={type}>{documentTypeLabels[type]}</option>)}
          </select>
        </label>
        {!isPmpk && <p className="form-error" role="alert">Это не заключение ПМПК: оно не повлияет на маршрут. Можно выбрать другой тип или удалить документ.</p>}
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
        <label>Занятий в неделю (только если указано в документе)
          <input type="number" min={1} max={14} inputMode="numeric" value={fields.sessions_per_week ?? ""}
            onChange={(event) => set("sessions_per_week", event.target.value === "" ? null : Number(event.target.value))} />
        </label>
        {quotes.length > 0 && <details><summary>Цитаты, на которых основан разбор</summary>
          {quotes.map((item, index) => <blockquote key={index} className="parse-quote"><FileText size={14} /> {fieldLabels[item.field] ?? "тип документа"}: {item.quote}</blockquote>)}
          <p className="field-hint">Цитаты не проверяются автоматически — сверяйте с оригиналом.</p>
        </details>}
        <div className="pmpk-actions">
          <Button type="submit" disabled={busy !== null || !isPmpk}>{busy === "confirm" ? "Сохраняем…" : "Подтвердить"}</Button>
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={remove}><Trash2 size={14} /> Удалить документ</Button>
        </div>
      </form>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </CardContent>
  </Card>;
}
