import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAndRefresh, statusCheckFailed } from "./pmpk-client";

const doc = (status: string, extra: object = {}) => ({ id: "doc-1", status, revision: 1, ...extra });
const failed = doc("failed", { error: { code: "openai_unavailable", message: "Сервис генерации временно недоступен." } });
const unavailable = () => Response.json({ error: { code: "openai_unavailable", message: "Сервис генерации временно недоступен." } }, { status: 503 });

// Routes each request to a queued response for its method + path, so the order of calls is checked too.
function server(routes: Record<string, (() => Response)[]>) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? "GET"} ${url}`]?.shift();
    if (!handler) throw new TypeError("network down");
    return handler();
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("PMPK panel recovery after a failed parse", () => {
  it("shows the server's failed state with retry, then a successful retry, without uploading again", async () => {
    const fetch = server({
      "POST /api/pmpk/doc-1/parse": [unavailable],
      "GET /api/pmpk": [() => Response.json({ document: failed })],
      "POST /api/pmpk/doc-1/retry": [() => Response.json({ document: doc("needs_review") })],
    });
    const first = await parseAndRefresh("doc-1", "parse");
    // Not the stale local pending_upload: the server says failed, and the panel offers "Повторить разбор".
    expect(first).toEqual({ known: true, document: failed, error: null });
    const second = await parseAndRefresh("doc-1", "retry");
    expect(second).toMatchObject({ known: true, document: { status: "needs_review" }, error: null });
    expect(fetch.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`))
      .toEqual(["POST /api/pmpk/doc-1/parse", "GET /api/pmpk", "POST /api/pmpk/doc-1/retry"]);
  });
  it("keeps watching when the server is still recognising", async () => {
    server({ "POST /api/pmpk/doc-1/parse": [() => new Response("gateway timeout", { status: 504 })], "GET /api/pmpk": [() => Response.json({ document: doc("parsing") })] });
    expect(await parseAndRefresh("doc-1", "parse")).toEqual({ known: true, document: doc("parsing"), error: null });
  });
  it("reports an unknown state instead of claiming the file was not uploaded", async () => {
    server({ "POST /api/pmpk/doc-1/parse": [unavailable] });
    expect(await parseAndRefresh("doc-1", "parse")).toEqual({ known: false, error: statusCheckFailed });
    expect(statusCheckFailed).not.toMatch(/не был загружен/);
  });
  it("keeps the parse error when the document does not explain it", async () => {
    server({ "POST /api/pmpk/doc-1/parse": [unavailable], "GET /api/pmpk": [() => Response.json({ document: null })] });
    expect(await parseAndRefresh("doc-1", "parse")).toEqual({ known: true, document: null, error: "Сервис генерации временно недоступен." });
  });
});
