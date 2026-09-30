import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userClient: vi.fn(), sdkClient: vi.fn(), parse: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.userClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.sdkClient }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => ({ url: "https://test.invalid", publishableKey: "public" }) }));
vi.mock("@/lib/env.server", () => ({
  ConfigError: class ConfigError extends Error {}, getAppUrl: () => "https://app.test",
  getOpenAIConfig: mocks.config, getSupabaseSecretKey: () => "server-key",
}));
vi.mock("./pmpk-openai", () => ({ parsePmpkDocument: mocks.parse }));
import { RouteApiError } from "./route-openai";
import {
  handleConfirmPmpk, handleCreatePmpk, handleDeletePmpk, handleGetPmpk, handleParsePmpk, handleResetParentData,
} from "./pmpk-api";

const owner = "user-a";
const docId = "11111111-1111-4111-8111-111111111111";
const storagePath = `${owner}/${docId}`;
const row: Record<string, unknown> = { id: docId, status: "pending_upload", mime_type: "image/png", size_bytes: 10, revision: 0, storage_path: storagePath,
  extracted_json: null, confirmed_json: null, error_code: null, lease_until: null, processed_at: null, confirmed_at: null };
const fields = { document_type: "PMPK_CONCLUSION", issued_on: "2026-04-24", consultation_on: "2026-04-23", issuer: null, next_route: "KPPK",
  specialists: ["defectolog", "logoped"], support_format: "individual_development_program", sessions_per_week: null };
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let user: { id: string } | null;
let stored: Record<string, unknown> | null;
let rpcResults: Record<string, { data?: unknown; error?: { message: string } | null }>;
let file: Uint8Array | null;
let queue: string[];
let listed: string[];
let removeError: object | null;
let inserted: object | null;
let insertError: { code: string } | null;
let rpc: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;

// A small in-memory stand-in: `queue` is storage_deletion_queue, `stored` the parent's only document row.
const chain = (table: string) => {
  const builder = {
    eq: () => builder,
    maybeSingle: async () => ({ data: table === "pmpk_documents" ? stored : null, error: null }),
    then: (resolve: (value: unknown) => void) => resolve({
      data: table === "pmpk_documents" ? (stored ? [stored] : []) : queue.map((path) => ({ path })), error: null,
    }),
  };
  return builder;
};
// Without `.in(...)` a delete clears every job of the parent, which is exactly the bug a test must catch.
const queueDelete = () => {
  let only: string[] | null = null;
  const builder = {
    eq: () => builder,
    in: (_field: string, values: string[]) => { only = values; return builder; },
    then: (resolve: (value: unknown) => void) => {
      queue = only ? queue.filter((path) => !only!.includes(path)) : [];
      resolve({ error: null });
    },
  };
  return builder;
};
const fakeClient = () => ({
  auth: { getUser: async () => ({ data: { user }, error: null }) },
  from: (table: string) => ({
    select: () => chain(table),
    insert: async (value: object) => { inserted = value; if (!insertError) stored = { ...row, ...value }; return { error: insertError }; },
    delete: queueDelete,
  }),
  rpc,
  storage: { from: () => ({
    download: async () => file ? { data: new Blob([file as BlobPart]), error: null } : { data: null, error: { message: "missing" } },
    createSignedUrl: async () => ({ data: { signedUrl: "https://signed.test/file" } }),
    list: async () => ({ data: listed.map((name) => ({ name })), error: null }),
    remove,
  }) },
});

const request = (method: string, body?: unknown, origin = "https://app.test") => new Request("https://app.test/api/pmpk", {
  method, headers: { Origin: origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: owner }; stored = { ...row }; file = png; queue = []; listed = []; removeError = null; inserted = null; insertError = null;
  rpcResults = { claim_pmpk_parse: { data: { claim: "acquired", generation_id: "gen-1", revision: 1, storage_path: storagePath } } };
  rpc = vi.fn(async (name: string) => rpcResults[name] ?? { data: null, error: null });
  remove = vi.fn(async () => ({ error: removeError }));
  mocks.config.mockReturnValue({ apiKey: "test-only", model: "test" });
  mocks.userClient.mockResolvedValue(fakeClient());
  mocks.sdkClient.mockImplementation(fakeClient);
  mocks.parse.mockResolvedValue({ extraction: { ...fields, source_quotes: [], dropped_fields: [] }, model: "test", schemaVersion: "v1" });
});

describe("PMPK upload", () => {
  it("registers the document and returns where the browser uploads, without touching the file", async () => {
    stored = null;
    const response = await handleCreatePmpk(request("POST", { mime_type: "image/png", size_bytes: 1000, consent: true }));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.upload.path).toBe(`${owner}/${data.document.id}`);
    expect(inserted).toMatchObject({ parent_id: owner, status: "pending_upload", consent_version: expect.any(String) });
  });
  it.each([
    [{ mime_type: "image/png", size_bytes: 1000 }], [{ mime_type: "image/png", size_bytes: 1000, consent: false }],
    [{ mime_type: "text/html", size_bytes: 1000, consent: true }], [{ mime_type: "image/png", size_bytes: 11 * 1024 * 1024, consent: true }],
    [{ mime_type: "image/png", size_bytes: 1000, consent: true, parent_id: "someone-else" }],
  ])("requires explicit consent and an allowed file", async (body) => {
    expect((await handleCreatePmpk(request("POST", body))).status).toBe(400);
    expect(inserted).toBeNull();
  });
  it("allows one document per parent", async () => {
    insertError = { code: "23505" };
    const response = await handleCreatePmpk(request("POST", { mime_type: "image/png", size_bytes: 1000, consent: true }));
    expect(response.status).toBe(409);
  });
  it("rejects cross-origin and anonymous requests before doing anything", async () => {
    expect((await handleCreatePmpk(request("POST", {}, "https://evil.test"))).status).toBe(403);
    user = null;
    expect((await handleParsePmpk(request("POST"), docId)).status).toBe(401);
    expect(mocks.parse).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
});

describe("PMPK recognition", () => {
  it("reads the original privately, recognises it and saves through the guarded RPC", async () => {
    stored = { ...row, status: "needs_review", revision: 1 };
    const response = await handleParsePmpk(request("POST"), docId);
    expect(response.status).toBe(200);
    expect(mocks.parse).toHaveBeenCalledWith({ bytes: expect.any(Uint8Array), mime: "image/png" }, expect.anything());
    const finish = rpc.mock.calls.find(([name]) => name === "finish_pmpk_parse")![1];
    expect(finish).toMatchObject({ p_generation_id: "gen-1", p_parent_id: owner });
    expect(finish.p_meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await response.json()).document.file_url).toContain("signed.test");
  });
  it("does not start a second recognition while one is running", async () => {
    rpcResults.claim_pmpk_parse = { data: { claim: "busy" } };
    expect((await handleParsePmpk(request("POST"), docId)).status).toBe(202);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("drops a late model answer after a reset instead of restoring anything", async () => {
    rpcResults.finish_pmpk_parse = { error: { message: "generation_conflict" } };
    stored = null;
    const response = await handleParsePmpk(request("POST"), docId);
    expect(response.status).toBe(409);
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("fail_pmpk_parse");
  });
  it.each([
    ["a file that is not PDF, PNG or JPEG", Uint8Array.from([0x3c, 0x68, 0x74]), "invalid_file"],
    ["an upload that never arrived", null, "file_missing"],
  ])("marks %s as failed without calling OpenAI", async (_name, content, code) => {
    file = content;
    const response = await handleParsePmpk(request("POST"), docId);
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe(code);
    expect(rpc).toHaveBeenCalledWith("fail_pmpk_parse", expect.objectContaining({ p_code: code }));
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("records a provider failure so the parent can retry", async () => {
    mocks.parse.mockRejectedValue(new RouteApiError("openai_unavailable", 503));
    expect((await handleParsePmpk(request("POST"), docId)).status).toBe(503);
    expect(rpc).toHaveBeenCalledWith("fail_pmpk_parse", expect.objectContaining({ p_code: "openai_unavailable" }));
  });
  it("saves the file and reports failure when OpenAI is not configured", async () => {
    mocks.config.mockReturnValue(null);
    expect((await handleParsePmpk(request("POST"), docId)).status).toBe(503);
    expect(rpc).toHaveBeenCalledWith("fail_pmpk_parse", expect.objectContaining({ p_code: "configuration_missing" }));
  });
  it("presents an expired lease as a failure that can be retried", async () => {
    stored = { ...row, status: "parsing", lease_until: new Date(Date.now() - 1000).toISOString() };
    const data = await (await handleGetPmpk(new Request("https://app.test/api/pmpk"), null)).json();
    expect(data.document).toMatchObject({ status: "failed", error: { code: "generation_expired" } });
  });
});

describe("PMPK confirmation", () => {
  const confirm = (body: unknown) => handleConfirmPmpk(request("POST", body), docId);
  it("saves parent-corrected fields for the revision the parent saw", async () => {
    stored = { ...row, status: "confirmed", revision: 2 };
    expect((await confirm({ revision: 2, confirmed: { ...fields, sessions_per_week: 2 } })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("confirm_pmpk_document", expect.objectContaining({ p_revision: 2, p_confirmed: expect.objectContaining({ sessions_per_week: 2 }) }));
  });
  it("refuses documents that cannot steer the route", async () => {
    expect((await confirm({ revision: 1, confirmed: { ...fields, document_type: "OTHER" } })).status).toBe(422);
    expect((await confirm({ revision: 1, confirmed: { ...fields, issued_on: null, consultation_on: null } })).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects unknown fields and reports a stale revision", async () => {
    expect((await confirm({ revision: 1, confirmed: { ...fields, diagnosis: "x" } })).status).toBe(400);
    rpcResults.confirm_pmpk_document = { error: { message: "revision_conflict" } };
    expect((await confirm({ revision: 1, confirmed: fields })).status).toBe(409);
  });
});

describe("cleanup", () => {
  it("reset succeeds only after database rows and files are gone", async () => {
    rpcResults.reset_parent_data = { data: [storagePath] };
    queue = [storagePath]; listed = [docId, "orphan"]; stored = null;
    const response = await handleResetParentData(request("POST"));
    expect(response.status).toBe(204);
    expect(remove).toHaveBeenCalledWith(expect.arrayContaining([storagePath, `${owner}/orphan`]));
    expect(queue).toEqual([]);
  });
  it("does not report success while a file could not be deleted, and keeps the debt for a retry", async () => {
    queue = [storagePath]; removeError = { message: "storage down" };
    const response = await handleResetParentData(request("POST"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("cleanup_incomplete");
    expect(queue).toEqual([storagePath]);
  });
  it("lets a repeated delete finish the Storage part after the row is already gone", async () => {
    rpcResults.delete_pmpk_document = { error: { message: "document_not_found" } };
    queue = [storagePath]; stored = null;
    expect((await handleDeletePmpk(request("DELETE"), docId)).status).toBe(204);
    expect(remove).toHaveBeenCalled();
  });
  it("keeps a deletion job queued while cleanup was running", async () => {
    const late = `${owner}/22222222-2222-4222-8222-222222222222`;
    queue = [storagePath]; stored = null;
    // Another request (a second tab's reset or delete) queues its own job while Storage removes ours.
    remove.mockImplementationOnce(async () => { queue.push(late); return { error: null }; });
    expect((await handleResetParentData(request("POST"))).status).toBe(204);
    expect(remove).toHaveBeenCalledWith([storagePath]);
    expect(queue).toEqual([late]);
  });
  it("never deletes the file of a document uploaded while cleanup was running", async () => {
    const freshId = "33333333-3333-4333-8333-333333333333";
    queue = [storagePath]; listed = [docId, freshId, "orphan"];
    stored = { ...row, id: freshId, storage_path: `${owner}/${freshId}`, status: "parsing" };
    expect((await handleResetParentData(request("POST"))).status).toBe(204);
    const removed = remove.mock.calls.flatMap(([paths]) => paths);
    expect(removed).toEqual([storagePath, `${owner}/orphan`]);
    expect(removed).not.toContain(`${owner}/${freshId}`);
    expect(stored).not.toBeNull();
  });
  it("keeps every taken job when Storage fails, and finishes them on the next call", async () => {
    queue = [storagePath]; stored = null; removeError = { message: "storage down" };
    expect((await handleDeletePmpk(request("DELETE"), docId)).status).toBe(503);
    expect(queue).toEqual([storagePath]);
    removeError = null; rpcResults.delete_pmpk_document = { error: { message: "document_not_found" } };
    expect((await handleDeletePmpk(request("DELETE"), docId)).status).toBe(204);
    expect(queue).toEqual([]);
  });
  it("blocks cross-origin resets before touching data", async () => {
    expect((await handleResetParentData(request("POST", undefined, "https://evil.test"))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
