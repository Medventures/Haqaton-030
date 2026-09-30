import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { ConfigError, getAppUrl, getOpenAIConfig, getSupabaseSecretKey } from "@/lib/env.server";
import { isInterviewComplete, type ParentRoute } from "@/domain/parent-route";
import { routeInputsFromDocument, type RouteInputs } from "@/domain/pmpk";
import type { Answers } from "@/lib/interview";
import { generateWithOpenAI, RouteApiError } from "./route-openai";

export const messages: Record<string, string> = {
  facts_changed: "Данные документа изменились. Создайте маршрут снова.",
  unauthorized: "Войдите в аккаунт.", forbidden_origin: "Запрос с этого адреса запрещён.",
  invalid_request: "Неверный запрос.", interview_incomplete: "Сначала завершите интервью.",
  interview_changed: "Ответы изменились. Завершите интервью и создайте маршрут снова.",
  generation_conflict: "Генерация устарела. Повторите запрос.",
  generation_rate_limit: "Слишком частые запросы. Попробуйте позже.",
  generation_expired: "Генерация прервалась. Создайте маршрут снова.",
  no_applicable_actions: "Для этих ответов в справочнике пока нет подходящих действий.",
  openai_unavailable: "Сервис генерации временно недоступен. Попробуйте ещё раз.",
  openai_rate_limit: "Сервис генерации перегружен. Попробуйте позже.",
  openai_incomplete: "Генерация не завершена. Попробуйте ещё раз.",
  openai_refusal: "Модель не смогла подготовить маршрут по этим ответам.",
  invalid_model_output: "Ответ модели не прошёл проверку. Попробуйте ещё раз.",
  configuration_missing: "Генерация ещё не настроена на сервере.",
  database_unavailable: "Не удалось прочитать или сохранить маршрут. Попробуйте позже.",
};

export type RouteState = {
  status: "empty" | "generating" | "ready" | "failed";
  stale: boolean; plan: ParentRoute | null; error: { code: string; message: string } | null;
};

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } });
}

function databaseError(error: { message: string }) {
  const code = error.message;
  if (["interview_changed", "interview_incomplete", "generation_conflict", "facts_changed"].includes(code)) return new RouteApiError(code, 409);
  if (code === "generation_rate_limit") return new RouteApiError(code, 429);
  return new RouteApiError("database_unavailable", 503);
}

// Cookie session for the website; Bearer JWT for API clients. No browser-provided user_id.
export async function authenticatedClient(request: Request) {
  const authorization = request.headers.get("authorization");
  const { url, publishableKey } = getSupabaseEnv();
  let client: SupabaseClient;
  if (authorization) {
    if (!/^Bearer \S+$/i.test(authorization)) throw new RouteApiError("unauthorized", 401);
    client = createSupabaseClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user) throw new RouteApiError("unauthorized", 401);
    return { client, userId: data.user.id };
  }
  client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new RouteApiError("unauthorized", 401);
  return { client, userId: data.user.id };
}

export function checkRequestOrigin(request: Request, appUrl: string) {
  // Bearer credentials are explicitly supplied; ambient cookie requests need same-origin protection.
  if (request.headers.get("authorization")) return;
  if (request.headers.get("origin") !== new URL(appUrl).origin) throw new RouteApiError("forbidden_origin", 403);
}

async function readInputs(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("pmpk_documents")
    .select("id,status,confirmed_revision,confirmed_json").eq("parent_id", userId).maybeSingle();
  if (error) throw new RouteApiError("database_unavailable", 503);
  return routeInputsFromDocument(data);
}

async function readState(client: SupabaseClient, userId: string, answers: Answers, completed: boolean, inputs: RouteInputs): Promise<RouteState> {
  const { data, error } = await client.from("parent_ai_routes")
    .select("status,plan_json,generated_for_answers_json,generated_for_facts_json,error_code,lease_until").eq("parent_id", userId).maybeSingle();
  if (error) throw new RouteApiError("database_unavailable", 503);
  if (!data) return { status: "empty", stale: false, plan: null, error: null };
  const canonical = (value: unknown): string => JSON.stringify(value, function (_key, item) {
    return item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
  });
  const stale = !completed || canonical(data.generated_for_answers_json) !== canonical(answers)
    || canonical(data.generated_for_facts_json) !== canonical(inputs);
  const expired = data.status === "generating" && Date.parse(data.lease_until) <= Date.now();
  const code = expired ? "generation_expired" : data.error_code;
  return {
    status: expired ? "failed" : data.status, stale,
    plan: stale ? null : data.plan_json,
    error: code ? { code, message: messages[code] ?? messages.database_unavailable } : null,
  };
}

export async function handleParentRoute(request: Request, generate: boolean): Promise<Response> {
  try {
    if (generate) checkRequestOrigin(request, getAppUrl());
    const { client, userId } = await authenticatedClient(request);
    const { data: interview, error } = await client.from("interview_sessions")
      .select("answers_json,status").eq("parent_id", userId).maybeSingle();
    if (error) throw new RouteApiError("database_unavailable", 503);
    const answers = (interview?.answers_json ?? {}) as Answers;
    const complete = interview?.status === "completed" && isInterviewComplete(answers);
    const inputs = await readInputs(client, userId);
    if (!generate) return json(await readState(client, userId, answers, complete, inputs));
    let options: { regenerate?: boolean };
    try {
      const text = await request.text();
      if (text.length > 1024) throw new Error("large_request");
      options = z.strictObject({ regenerate: z.boolean().optional() }).parse(text ? JSON.parse(text) : {});
    } catch { throw new RouteApiError("invalid_request", 400); }
    if (!complete) throw new RouteApiError("interview_incomplete", 409);
    const config = getOpenAIConfig();
    if (!config) throw new RouteApiError("configuration_missing", 503);
    const { url } = getSupabaseEnv();
    const admin = createSupabaseClient(url, getSupabaseSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: claim, error: claimError } = await admin.rpc("claim_parent_route", {
      p_parent_id: userId, p_answers: answers, p_regenerate: options.regenerate ?? false,
    });
    if (claimError) throw databaseError(claimError);
    if (claim.claim !== "acquired") return json(await readState(client, userId, answers, complete, inputs), claim.claim === "busy" ? 202 : 200);
    try {
      // The database decides which confirmed document revision this generation is built on;
      // finish_parent_route re-checks it before saving.
      const plan = await generateWithOpenAI(answers, config, claim.facts);
      const { error: saveError } = await admin.rpc("finish_parent_route", {
        p_parent_id: userId, p_generation_id: claim.generation_id, p_plan: plan,
      });
      if (saveError) throw databaseError(saveError);
      return json(await readState(client, userId, answers, complete, claim.facts));
    } catch (failure) {
      const code = failure instanceof RouteApiError ? failure.code : "openai_unavailable";
      await admin.rpc("fail_parent_route", { p_parent_id: userId, p_generation_id: claim.generation_id, p_code: code });
      throw failure instanceof RouteApiError ? failure : new RouteApiError(code, 503);
    }
  } catch (error) {
    const failure = error instanceof RouteApiError ? error : new RouteApiError(error instanceof ConfigError ? "configuration_missing" : "database_unavailable", 503);
    return json({ error: { code: failure.code, message: messages[failure.code] ?? messages.database_unavailable } }, failure.status);
  }
}
