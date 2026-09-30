import "server-only";
import { createHash } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  confirmProblem, confirmSchema, createDocumentSchema, PMPK_BUCKET, PMPK_CONSENT_VERSION, PMPK_MAX_BYTES,
  sniffMime, type PmpkExtraction, type PmpkFields, type PmpkStatus,
} from "@/domain/pmpk";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { ConfigError, getAppUrl, getOpenAIConfig, getSupabaseSecretKey } from "@/lib/env.server";
import { authenticatedClient, checkRequestOrigin, json, messages as routeMessages } from "./parent-route-api";
import { parsePmpkDocument } from "./pmpk-openai";
import { RouteApiError } from "./route-openai";

const messages: Record<string, string> = {
  ...routeMessages,
  document_not_found: "Документ не найден.",
  document_exists: "Документ уже загружен. Удалите его, чтобы загрузить другой.",
  document_state_conflict: "Документ сейчас нельзя изменить.",
  revision_conflict: "Разбор документа обновился. Проверьте поля ещё раз.",
  parse_rate_limit: "Слишком частые попытки разбора. Попробуйте позже.",
  file_missing: "Файл не был загружен. Удалите документ и загрузите его снова.",
  invalid_file: "Файл не похож на PDF, PNG или JPEG. Удалите документ и загрузите другой файл.",
  file_too_large: "Файл слишком большой. Загрузите файл до 10 МБ.",
  not_pmpk_conclusion: "Это не заключение ПМПК. Оно не повлияет на маршрут.",
  date_required: "Укажите дату выдачи или дату консультации.",
  date_out_of_range: "Проверьте даты: они выглядят неверно.",
  consultation_after_issue: "Дата консультации не может быть позже даты выдачи.",
  cleanup_incomplete: "Не удалось полностью удалить файл. Повторите действие.",
};

export type PmpkDocumentState = {
  id: string; status: PmpkStatus; revision: number; mime_type: string; size_bytes: number;
  extracted: PmpkExtraction | null; confirmed: PmpkFields | null;
  error: { code: string; message: string } | null;
  // Short-lived link to the private original, for showing it next to the extracted fields.
  file_url: string | null; processed_at: string | null; confirmed_at: string | null;
};

const columns = "id,status,mime_type,size_bytes,revision,storage_path,extracted_json,confirmed_json,error_code,lease_until,processed_at,confirmed_at";

function adminClient(): SupabaseClient {
  const { url } = getSupabaseEnv();
  return createSupabaseClient(url, getSupabaseSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

function failureResponse(error: unknown) {
  const failure = error instanceof RouteApiError ? error
    : new RouteApiError(error instanceof ConfigError ? "configuration_missing" : "database_unavailable", 503);
  return json({ error: { code: failure.code, message: messages[failure.code] ?? messages.database_unavailable } }, failure.status);
}

function databaseError(error: { message: string }) {
  const code = error.message;
  if (code === "document_not_found") return new RouteApiError(code, 404);
  if (["revision_conflict", "document_state_conflict", "generation_conflict"].includes(code)) return new RouteApiError(code, 409);
  if (code === "parse_rate_limit") return new RouteApiError(code, 429);
  return new RouteApiError("database_unavailable", 503);
}

type Row = {
  id: string; status: PmpkStatus; mime_type: string; size_bytes: number; revision: number; storage_path: string;
  extracted_json: PmpkExtraction | null; confirmed_json: PmpkFields | null; error_code: string | null;
  lease_until: string | null; processed_at: string | null; confirmed_at: string | null;
};

async function toState(row: Row, admin: SupabaseClient): Promise<PmpkDocumentState> {
  const expired = row.status === "parsing" && row.lease_until !== null && Date.parse(row.lease_until) <= Date.now();
  const status = expired ? "failed" : row.status;
  const code = expired ? "generation_expired" : row.error_code;
  let fileUrl: string | null = null;
  if (status !== "pending_upload") {
    const { data } = await admin.storage.from(PMPK_BUCKET).createSignedUrl(row.storage_path, 300);
    fileUrl = data?.signedUrl ?? null;
  }
  return {
    id: row.id, status, revision: row.revision, mime_type: row.mime_type, size_bytes: row.size_bytes,
    extracted: row.extracted_json, confirmed: row.confirmed_json,
    error: code ? { code, message: messages[code] ?? routeMessages[code] ?? messages.database_unavailable } : null,
    file_url: fileUrl, processed_at: row.processed_at, confirmed_at: row.confirmed_at,
  };
}

async function readDocument(client: SupabaseClient, userId: string, id: string | null) {
  let query = client.from("pmpk_documents").select(columns).eq("parent_id", userId);
  if (id) query = query.eq("id", id);
  const { data, error } = await query.maybeSingle();
  if (error) throw new RouteApiError("database_unavailable", 503);
  return data as Row | null;
}

// Pays the recorded Storage debt. With `sweep`, also removes objects left under the parent's folder
// (an upload that landed after its document row was deleted), but never the file of a live document.
// Only the jobs taken here leave the queue, and only after Storage confirmed the removal: jobs queued
// meanwhile stay for the next pass. Returns false while any taken job remains.
export async function drainStorageQueue(admin: SupabaseClient, parentId: string, sweep = false): Promise<boolean> {
  const queued = await admin.from("storage_deletion_queue").select("path").eq("parent_id", parentId);
  if (queued.error) return false;
  const jobs = (queued.data ?? []).map((row: { path: string }) => row.path);
  const orphans: string[] = [];
  if (sweep) {
    const listed = await admin.storage.from(PMPK_BUCKET).list(parentId, { limit: 1000 });
    if (listed.error) return false;
    // Read live documents after listing: an object can only be uploaded for a row that already exists.
    const live = await admin.from("pmpk_documents").select("storage_path").eq("parent_id", parentId);
    if (live.error) return false;
    const kept = new Set((live.data ?? []).map((row: { storage_path: string }) => row.storage_path));
    for (const object of listed.data ?? []) {
      const path = `${parentId}/${object.name}`;
      if (!kept.has(path) && !jobs.includes(path)) orphans.push(path);
    }
  }
  const paths = [...jobs, ...orphans];
  if (paths.length) {
    const removed = await admin.storage.from(PMPK_BUCKET).remove(paths);
    if (removed.error) return false;
  }
  if (!jobs.length) return true;
  const cleared = await admin.from("storage_deletion_queue").delete().eq("parent_id", parentId).in("path", jobs);
  return !cleared.error;
}

async function readBody(request: Request) {
  const text = await request.text();
  if (text.length > 20_000) throw new RouteApiError("invalid_request", 400);
  try { return text ? JSON.parse(text) : {}; } catch { throw new RouteApiError("invalid_request", 400); }
}

export async function handleGetPmpk(request: Request, id: string | null): Promise<Response> {
  try {
    const { client, userId } = await authenticatedClient(request);
    const row = await readDocument(client, userId, id);
    if (id && !row) throw new RouteApiError("document_not_found", 404);
    return json({ document: row ? await toState(row, adminClient()) : null });
  } catch (error) { return failureResponse(error); }
}

// Registers the document and returns where the browser uploads the original. The file itself
// never passes through this function, so photo-sized files are not limited by the request-body cap.
export async function handleCreatePmpk(request: Request): Promise<Response> {
  try {
    checkRequestOrigin(request, getAppUrl());
    const { userId } = await authenticatedClient(request);
    const parsed = createDocumentSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new RouteApiError("invalid_request", 400);
    const admin = adminClient();
    await drainStorageQueue(admin, userId);
    const id = crypto.randomUUID();
    const path = `${userId}/${id}`;
    const { error } = await admin.from("pmpk_documents").insert({
      id, parent_id: userId, status: "pending_upload", storage_path: path, mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes, consent_version: PMPK_CONSENT_VERSION,
    });
    if (error) throw error.code === "23505" ? new RouteApiError("document_exists", 409) : new RouteApiError("database_unavailable", 503);
    const row = await readDocument(admin, userId, id);
    return json({ document: await toState(row!, admin), upload: { bucket: PMPK_BUCKET, path } }, 201);
  } catch (error) { return failureResponse(error); }
}

// Starts (or restarts after a failure) recognition. The claim, not the browser, decides whether it may run.
export async function handleParsePmpk(request: Request, id: string): Promise<Response> {
  try {
    checkRequestOrigin(request, getAppUrl());
    const { client, userId } = await authenticatedClient(request);
    const admin = adminClient();
    const { data: claim, error: claimError } = await admin.rpc("claim_pmpk_parse", { p_parent_id: userId, p_id: id });
    if (claimError) throw databaseError(claimError);
    if (claim.claim !== "acquired") {
      const row = await readDocument(client, userId, id);
      return json({ document: row ? await toState(row, admin) : null }, claim.claim === "busy" ? 202 : 200);
    }
    const started = Date.now();
    const fail = async (code: string, status: number): Promise<never> => {
      await admin.rpc("fail_pmpk_parse", { p_parent_id: userId, p_id: id, p_generation_id: claim.generation_id, p_code: code });
      throw new RouteApiError(code, status);
    };
    try {
      const config = getOpenAIConfig();
      if (!config) return await fail("configuration_missing", 503);
      const { data: blob, error: downloadError } = await admin.storage.from(PMPK_BUCKET).download(claim.storage_path);
      if (downloadError || !blob) return await fail("file_missing", 422);
      if (blob.size > PMPK_MAX_BYTES) return await fail("file_too_large", 422);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = sniffMime(bytes);
      if (!mime) return await fail("invalid_file", 422);
      const { extraction, model, schemaVersion } = await parsePmpkDocument({ bytes, mime }, config);
      const { error: saveError } = await admin.rpc("finish_pmpk_parse", {
        p_parent_id: userId, p_id: id, p_generation_id: claim.generation_id, p_extracted: extraction,
        p_meta: { model, schema_version: schemaVersion, sha256: createHash("sha256").update(bytes).digest("hex"), processing_ms: Date.now() - started },
      });
      // The document was deleted, reset or re-claimed meanwhile: drop the answer, restore nothing.
      if (saveError) throw databaseError(saveError);
    } catch (failure) {
      if (failure instanceof RouteApiError && (failure.code === "generation_conflict" || ["file_missing", "file_too_large", "invalid_file", "configuration_missing"].includes(failure.code))) throw failure;
      const code = failure instanceof RouteApiError ? failure.code : "openai_unavailable";
      await admin.rpc("fail_pmpk_parse", { p_parent_id: userId, p_id: id, p_generation_id: claim.generation_id, p_code: code });
      throw failure instanceof RouteApiError ? failure : new RouteApiError(code, 503);
    }
    const row = await readDocument(client, userId, id);
    if (!row) throw new RouteApiError("generation_conflict", 409);
    return json({ document: await toState(row, admin) });
  } catch (error) { return failureResponse(error); }
}

export async function handleConfirmPmpk(request: Request, id: string): Promise<Response> {
  try {
    checkRequestOrigin(request, getAppUrl());
    const { client, userId } = await authenticatedClient(request);
    const parsed = confirmSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new RouteApiError("invalid_request", 400);
    const problem = confirmProblem(parsed.data.confirmed);
    if (problem) throw new RouteApiError(problem, 422);
    const admin = adminClient();
    const { error } = await admin.rpc("confirm_pmpk_document", {
      p_parent_id: userId, p_id: id, p_revision: parsed.data.revision, p_confirmed: parsed.data.confirmed,
    });
    if (error) throw databaseError(error);
    const row = await readDocument(client, userId, id);
    if (!row) throw new RouteApiError("document_not_found", 404);
    return json({ document: await toState(row, admin) });
  } catch (error) { return failureResponse(error); }
}

// Success means the database row and the Storage object are both gone.
export async function handleDeletePmpk(request: Request, id: string): Promise<Response> {
  try {
    checkRequestOrigin(request, getAppUrl());
    const { userId } = await authenticatedClient(request);
    const admin = adminClient();
    const { error } = await admin.rpc("delete_pmpk_document", { p_parent_id: userId, p_id: id });
    // A retry after a failed cleanup finds no row; it still has to finish the Storage part.
    if (error && error.message !== "document_not_found") throw databaseError(error);
    if (!await drainStorageQueue(admin, userId, true)) throw new RouteApiError("cleanup_incomplete", 503);
    return new Response(null, { status: 204 });
  } catch (error) { return failureResponse(error); }
}

// Clears the questionnaire, PMPK documents with their originals, and the route built on them.
export async function handleResetParentData(request: Request): Promise<Response> {
  try {
    checkRequestOrigin(request, getAppUrl());
    const { userId } = await authenticatedClient(request);
    const admin = adminClient();
    const { error } = await admin.rpc("reset_parent_data", { p_parent_id: userId });
    if (error) throw databaseError(error);
    if (!await drainStorageQueue(admin, userId, true)) throw new RouteApiError("cleanup_incomplete", 503);
    return new Response(null, { status: 204 });
  } catch (error) { return failureResponse(error); }
}
