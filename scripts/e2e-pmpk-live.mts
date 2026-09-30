// Live end-to-end pass for the PMPK flow against a running app, the real Supabase project and OpenAI.
// Creates a temporary user with synthetic data and deletes it at the end. Never uses the demo accounts.
//
//   E2E_LIVE=1 E2E_FILES=<dir with pmpk-synthetic.png and pmpk-synthetic.pdf> \
//   E2E_BASE=http://localhost:3100 [E2E_BAD_BASE=http://localhost:3101] \
//   pnpm exec tsx --env-file=.env.local scripts/e2e-pmpk-live.mts
//
// E2E_BAD_BASE is the same build started with an invalid OPENAI_API_KEY: it simulates OpenAI being down.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { caseAAnswers } from "../src/domain/fixtures/cases";

if (process.env.E2E_LIVE !== "1") throw new Error("Set E2E_LIVE=1: this script writes to the configured Supabase project.");
const base = process.env.E2E_BASE ?? "http://localhost:3100";
const badBase = process.env.E2E_BAD_BASE;
const files = process.env.E2E_FILES ?? ".";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const bucket = "pmpk-documents";
const answers = { ...caseAAnswers, CURRENT_SERVICES: "none" };
const png = readFileSync(join(files, "pmpk-synthetic.png"));
const pdf = readFileSync(join(files, "pmpk-synthetic.pdf"));

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const email = `pmpk-e2e-${Date.now()}@aqylroute.test`;
const password = randomBytes(24).toString("base64url");
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "E2E синтетический родитель" } });
if (createError || !created.user) throw new Error(`cannot create test user: ${createError?.message}`);
const userId = created.user.id;
const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError || !session.session) throw new Error(`cannot sign in test user: ${signInError?.message}`);
const token = session.session.access_token;

async function api(method: string, path: string, body?: unknown, at = base) {
  const response = await fetch(`${at}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, data };
}
async function upload(mime: string, bytes: Buffer) {
  const createdDoc = await api("POST", "/api/pmpk", { mime_type: mime, size_bytes: bytes.length, consent: true });
  if (createdDoc.status !== 201) throw new Error(`register failed: ${JSON.stringify(createdDoc)}`);
  const { error } = await client.storage.from(bucket).upload(createdDoc.data.upload.path, bytes, { contentType: mime });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return createdDoc.data.document.id as string;
}
async function dbState() {
  const [docs, routes, interview, queue, objects] = await Promise.all([
    admin.from("pmpk_documents").select("id,status").eq("parent_id", userId),
    admin.from("parent_ai_routes").select("status").eq("parent_id", userId),
    admin.from("interview_sessions").select("answers_json,status").eq("parent_id", userId).maybeSingle(),
    admin.from("storage_deletion_queue").select("path").eq("parent_id", userId),
    admin.storage.from(bucket).list(userId),
  ]);
  return { documents: docs.data?.length, routes: routes.data?.length, interview: interview.data, queue: queue.data?.length, objects: objects.data?.length };
}
let lastRoute = 0;
async function generateRoute() {
  // The route API allows one generation per minute per user.
  const wait = lastRoute + 61_000 - Date.now();
  if (wait > 0) { console.log(`  … waiting ${Math.ceil(wait / 1000)} s for the route rate limit`); await sleep(wait); }
  lastRoute = Date.now();
  return api("POST", "/api/agent/route", { regenerate: true });
}
const stepIds = (plan: { steps: { action_id: string }[] } | null) => plan?.steps.map((step) => step.action_id) ?? [];
const fieldsOf = (extracted: Record<string, unknown>) => {
  const { source_quotes: _quotes, dropped_fields: _dropped, ...fields } = extracted;
  void _quotes; void _dropped;
  return fields;
};

try {
  console.log(`Test user ${userId} (${email}), app ${base}`);
  await client.from("interview_sessions").upsert({ parent_id: userId, answers_json: answers, status: "completed", completed_at: new Date().toISOString() });

  console.log("\n== 1. Route before the PMPK document");
  const before = await generateRoute();
  check("route generated from the interview", before.status === 200, stepIds(before.data?.plan));

  console.log("\n== 2. Upload → recognise (PNG)");
  const docId = await upload("image/png", png);
  const parsed = await api("POST", `/api/pmpk/${docId}/parse`);
  const extracted = parsed.data?.document?.extracted;
  check("recognition finished with needs_review", parsed.status === 200 && parsed.data?.document?.status === "needs_review", parsed.data?.error ?? parsed.data?.document?.status);
  console.log("  extracted:", JSON.stringify(extracted));
  check("issue date and consultation date kept separately", extracted?.issued_on === "2026-04-24" && extracted?.consultation_on === "2026-04-23");
  check("direction KPPK", extracted?.next_route === "KPPK");
  check("defectologist and speech therapist", ["defectolog", "logoped"].every((id) => extracted?.specialists?.includes(id)), extracted?.specialists);
  check("no invented frequency", extracted?.sessions_per_week === null);
  check("quotes for recommendations", extracted?.source_quotes?.length > 0, extracted?.source_quotes?.map((quote: { field: string }) => quote.field));
  const signed = await fetch(parsed.data.document.file_url);
  check("original opens by the signed link", signed.ok && sha256(new Uint8Array(await signed.arrayBuffer())) === sha256(png));
  const publicUrl = admin.storage.from(bucket).getPublicUrl(`${userId}/${docId}`).data.publicUrl;
  check("original is not public", !(await fetch(publicUrl)).ok);

  console.log("\n== 3. Confirm → route");
  const confirmed = await api("POST", `/api/pmpk/${docId}/confirm`, { revision: parsed.data.document.revision, confirmed: fieldsOf(extracted) });
  check("confirmed", confirmed.status === 200 && confirmed.data?.document?.status === "confirmed", confirmed.data?.error);
  const staleAfterConfirm = await api("GET", "/api/agent/route");
  check("route built before the conclusion is stale", staleAfterConfirm.data?.stale === true && staleAfterConfirm.data?.plan === null);
  const withKppk = await generateRoute();
  const kppkSteps = stepIds(withKppk.data?.plan);
  check("new route generated", withKppk.status === 200, kppkSteps);
  check("PMPK stage removed", !kppkSteps.some((id) => id.startsWith("PMPK_")));
  const kppkStep = withKppk.data?.plan?.steps.find((step: { action_id: string }) => step.action_id === "EDU_REHAB_APPLY");
  check("KPPK step present and ready", kppkStep?.status === "ready", kppkStep ? { status: kppkStep.status, requirements: kppkStep.requirements } : "not selected by the model");

  console.log("\n== 4. Reload");
  const reloadedDoc = await api("GET", "/api/pmpk");
  const reloadedRoute = await api("GET", "/api/agent/route");
  check("document still confirmed after reload", reloadedDoc.data?.document?.status === "confirmed" && reloadedDoc.data?.document?.confirmed?.next_route === "KPPK");
  check("route still ready and current after reload", reloadedRoute.data?.status === "ready" && reloadedRoute.data?.stale === false
    && JSON.stringify(stepIds(reloadedRoute.data?.plan)) === JSON.stringify(kppkSteps));

  console.log("\n== 5. Parent changes the direction to OTHER");
  const other = await api("POST", `/api/pmpk/${docId}/confirm`, { revision: parsed.data.document.revision, confirmed: { ...fieldsOf(extracted), next_route: "OTHER" } });
  check("correction saved", other.status === 200);
  const staleAfterEdit = await api("GET", "/api/agent/route");
  check("route built on KPPK is stale after the correction", staleAfterEdit.data?.stale === true && staleAfterEdit.data?.plan === null);
  const withOther = await generateRoute();
  const otherKppk = withOther.data?.plan?.steps.find((step: { action_id: string }) => step.action_id === "EDU_REHAB_APPLY");
  check("KPPK step not unblocked without a KPPK direction", !otherKppk || otherKppk.status === "blocked",
    otherKppk ? { status: otherKppk.status, requirements: otherKppk.requirements } : "not in the route");

  console.log("\n== 6. Reset");
  const reset = await api("POST", "/api/interview/reset");
  const afterReset = await dbState();
  check("reset returned 204", reset.status === 204, reset.data);
  check("interview, document, file, queue and route are gone", afterReset.documents === 0 && afterReset.routes === 0 && afterReset.queue === 0
    && afterReset.objects === 0 && afterReset.interview?.status === "draft" && JSON.stringify(afterReset.interview?.answers_json) === "{}", afterReset);

  console.log("\n== 7. Reset while OpenAI is reading the document (PDF)");
  const racingId = await upload("application/pdf", pdf);
  const racing = api("POST", `/api/pmpk/${racingId}/parse`);
  for (let i = 0; i < 50; i++) {
    const { data } = await admin.from("pmpk_documents").select("status").eq("id", racingId).maybeSingle();
    if (data?.status === "parsing") break;
    await sleep(200);
  }
  await sleep(1500);
  const racingReset = await api("POST", "/api/interview/reset");
  check("reset during recognition returned 204", racingReset.status === 204, racingReset.data);
  const late = await racing;
  check("late model answer rejected", late.status === 409 && late.data?.error?.code === "generation_conflict", { status: late.status, error: late.data?.error });
  await sleep(1000);
  const afterRace = await dbState();
  check("nothing restored after the late answer", afterRace.documents === 0 && afterRace.objects === 0 && afterRace.queue === 0, afterRace);

  if (badBase) {
    console.log("\n== 8. OpenAI unavailable → retry without uploading again");
    const retryId = await upload("image/png", png);
    const down = await api("POST", `/api/pmpk/${retryId}/parse`, undefined, badBase);
    check("parse fails while OpenAI is unavailable", down.status === 503, down.data?.error);
    const state = await api("GET", "/api/pmpk");
    check("server state is failed with a retryable code, not pending_upload", state.data?.document?.status === "failed"
      && state.data?.document?.error?.code === "openai_unavailable", state.data?.document?.error);
    console.log("  … waiting 31 s for the parse rate limit");
    await sleep(31_000);
    const retried = await api("POST", `/api/pmpk/${retryId}/retry`);
    check("retry succeeds", retried.status === 200 && retried.data?.document?.status === "needs_review", retried.data?.error);
    const objects = (await admin.storage.from(bucket).list(userId)).data ?? [];
    const { data: row } = await admin.from("pmpk_documents").select("sha256,revision").eq("id", retryId).single();
    check("same single upload was recognised", objects.length === 1 && row?.sha256 === sha256(png), { objects: objects.length, revision: row?.revision });
    await api("POST", "/api/interview/reset");
  }
} finally {
  const leftovers = (await admin.storage.from(bucket).list(userId)).data ?? [];
  if (leftovers.length) await admin.storage.from(bucket).remove(leftovers.map((object) => `${userId}/${object.name}`));
  await admin.from("storage_deletion_queue").delete().eq("parent_id", userId);
  await admin.auth.admin.deleteUser(userId);
  console.log(`\nTest user deleted. ${failures ? `${failures} check(s) failed` : "All checks passed"}.`);
  process.exitCode = failures ? 1 : 0;
}
