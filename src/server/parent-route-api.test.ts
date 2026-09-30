import { beforeEach, describe, expect, it, vi } from "vitest";
import { caseAAnswers } from "@/domain/fixtures/cases";
import { assembleRoute } from "@/domain/parent-route";

const mocks = vi.hoisted(() => ({ userClient: vi.fn(), sdkClient: vi.fn(), generate: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.userClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.sdkClient }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => ({ url: "https://test.invalid", publishableKey: "public" }) }));
vi.mock("@/lib/env.server", () => ({
  ConfigError: class ConfigError extends Error {}, getAppUrl: () => "https://app.test",
  getOpenAIConfig: mocks.config, getSupabaseSecretKey: () => "server-key",
}));
vi.mock("./route-openai", async (importOriginal) => {
  const original = await importOriginal<typeof import("./route-openai")>();
  return { ...original, generateWithOpenAI: mocks.generate };
});
import { handleParentRoute } from "./parent-route-api";

const answers = { ...caseAAnswers, CURRENT_SERVICES: "none" };
const plan = assembleRoute({ selected_actions: [{ action_id: "PMPK_APPLY", priority: "high", rationale: "Подайте заявление для получения рекомендаций по поддержке ребёнка." }] }, answers, "test");
let interview: { status: string; answers_json: object };
let route: object | null;
let pmpkDocument: object | null;
const noFacts = { pmpk_conclusion_confirmed: false, pmpk: null };
const confirmedRow = (confirmed_revision: number, next_route: string | null) => ({
  id: "doc-1", status: "confirmed", confirmed_revision,
  confirmed_json: { document_type: "PMPK_CONCLUSION", next_route, specialists: ["logoped"], support_format: null },
});
const inputsFor = (revision: number, next_route: string | null) => ({
  pmpk_conclusion_confirmed: true,
  pmpk: { document_id: "doc-1", revision, next_route, specialists: ["logoped"], support_format: null },
});
let user: { id: string } | null;
let claim: { data: object | null; error: { message: string } | null };
let savedError: { message: string } | null;
let rpc: ReturnType<typeof vi.fn>;

const post = (body = "{}", origin = "https://app.test") => new Request("https://app.test/api/agent/route", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body,
});

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "user-a" }; interview = { status: "completed", answers_json: answers }; route = null; pmpkDocument = null;
  claim = { data: { claim: "acquired", generation_id: "generation-a", facts: noFacts }, error: null }; savedError = null;
  mocks.config.mockReturnValue({ apiKey: "test-only", model: "test" });
  mocks.generate.mockResolvedValue(plan);
  mocks.userClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => ({ select: () => ({ eq: (_field: string, owner: string) => ({
      maybeSingle: async () => {
        expect(owner).toBe("user-a");
        return { data: table === "interview_sessions" ? interview : table === "pmpk_documents" ? pmpkDocument : route, error: null };
      },
    }) }) }),
  });
  rpc = vi.fn(async (name: string) => {
    if (name === "claim_parent_route") return claim;
    if (name === "finish_parent_route") {
      if (!savedError) route = { status: "ready", plan_json: plan, generated_for_answers_json: answers, generated_for_facts_json: noFacts, error_code: null, lease_until: new Date().toISOString() };
      return { error: savedError };
    }
    return { error: null };
  });
  mocks.sdkClient.mockReturnValue({ rpc });
});

describe("parent route API", () => {
  it("rejects cross-origin cookie mutations before accessing data", async () => {
    const response = await handleParentRoute(post("{}", "https://evil.test"), true);
    expect(response.status).toBe(403); expect(mocks.userClient).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("rejects requests without a session before invoking OpenAI", async () => {
    user = null;
    const response = await handleParentRoute(post(), true);
    expect(response.status).toBe(401); expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.sdkClient).not.toHaveBeenCalled();
  });
  it("requires the saved interview to be complete", async () => {
    interview.status = "draft";
    expect((await handleParentRoute(post(), true)).status).toBe(409);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not trust browser-provided answers or user ids", async () => {
    expect((await handleParentRoute(post('{"user_id":"other"}'), true)).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("claims, generates and saves before returning the route", async () => {
    const response = await handleParentRoute(post(), true);
    expect(response.status).toBe(200);
    expect((await response.json()).plan).toEqual(plan);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["claim_parent_route", "finish_parent_route"]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("reads saved routes without calling OpenAI", async () => {
    route = { status: "ready", plan_json: plan, generated_for_answers_json: answers, generated_for_facts_json: noFacts };
    const response = await handleParentRoute(new Request("https://app.test/api/agent/route"), false);
    expect((await response.json()).plan).toEqual(plan);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not expose a route generated for different answers", async () => {
    route = { status: "ready", plan_json: plan, generated_for_answers_json: { AGE: 17 }, generated_for_facts_json: noFacts };
    const data = await (await handleParentRoute(new Request("https://app.test/api/agent/route"), false)).json();
    expect(data.stale).toBe(true); expect(data.plan).toBeNull();
  });
  it("marks a route stale once a PMPK conclusion is confirmed", async () => {
    route = { status: "ready", plan_json: plan, generated_for_answers_json: answers, generated_for_facts_json: noFacts };
    pmpkDocument = confirmedRow(1, "KPPK");
    const data = await (await handleParentRoute(new Request("https://app.test/api/agent/route"), false)).json();
    expect(data.stale).toBe(true); expect(data.plan).toBeNull();
  });
  it("ignores an unconfirmed or non-PMPK document", async () => {
    route = { status: "ready", plan_json: plan, generated_for_answers_json: answers, generated_for_facts_json: noFacts };
    for (const document of [{ id: "doc-1", status: "needs_review", confirmed_revision: 0, confirmed_json: null }, { id: "doc-1", status: "confirmed", confirmed_revision: 1, confirmed_json: { document_type: "OTHER" } }]) {
      pmpkDocument = document;
      const data = await (await handleParentRoute(new Request("https://app.test/api/agent/route"), false)).json();
      expect(data.stale).toBe(false);
    }
  });
  it.each([
    ["the direction changed after generation", confirmedRow(2, "OTHER")],
    ["the conclusion was corrected (new confirmed revision)", confirmedRow(2, "KPPK")],
    ["the document was deleted", null],
  ])("hides a route built on an older PMPK conclusion when %s", async (_case, document) => {
    route = { status: "ready", plan_json: plan, generated_for_answers_json: answers, generated_for_facts_json: inputsFor(1, "KPPK") };
    pmpkDocument = document;
    const data = await (await handleParentRoute(new Request("https://app.test/api/agent/route"), false)).json();
    expect(data.stale).toBe(true); expect(data.plan).toBeNull();
  });
  it("keeps showing a route built on the current conclusion", async () => {
    route = { status: "ready", plan_json: plan, generated_for_answers_json: answers, generated_for_facts_json: inputsFor(1, "KPPK") };
    pmpkDocument = confirmedRow(1, "KPPK");
    const data = await (await handleParentRoute(new Request("https://app.test/api/agent/route"), false)).json();
    expect(data.stale).toBe(false); expect(data.plan).toEqual(plan);
  });
  it("does not return a model answer when the conclusion changed during the OpenAI call", async () => {
    savedError = { message: "facts_changed" };
    expect((await handleParentRoute(post(), true)).status).toBe(409);
    expect(rpc.mock.calls.map(([name]) => name)).toContain("fail_parent_route");
  });
  it("generates from the facts the database chose", async () => {
    const facts = inputsFor(1, "KPPK");
    claim.data = { claim: "acquired", generation_id: "generation-a", facts };
    await handleParentRoute(post(), true);
    expect(mocks.generate).toHaveBeenCalledWith(answers, expect.anything(), facts);
  });
  it("reuses the existing route without a paid model call", async () => {
    claim.data = { claim: "cached" };
    route = { status: "ready", plan_json: plan, generated_for_answers_json: answers, generated_for_facts_json: noFacts };
    expect((await handleParentRoute(post(), true)).status).toBe(200);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("rejects rate-limited generation before a model call", async () => {
    claim = { data: null, error: { message: "generation_rate_limit" } };
    expect((await handleParentRoute(post(), true)).status).toBe(429);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not return an unsaved or obsolete model response", async () => {
    savedError = { message: "interview_changed" };
    expect((await handleParentRoute(post(), true)).status).toBe(409);
    expect(rpc.mock.calls.map(([name]) => name)).toContain("fail_parent_route");
  });
  it("does not call OpenAI without configuration", async () => {
    mocks.config.mockReturnValue(null);
    expect((await handleParentRoute(post(), true)).status).toBe(503);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
