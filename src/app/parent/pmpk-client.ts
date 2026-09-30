import type { PmpkDocumentState } from "@/server/pmpk-api";

export async function call<T = { document: PmpkDocumentState | null }>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Не удалось выполнить запрос.");
  return data;
}

export const statusCheckFailed = "Не удалось проверить состояние документа. Файл мог сохраниться — проверьте ещё раз.";

export type ParseOutcome =
  // The server's own view of the document; `error` only when the document itself does not explain the failure.
  | { known: true; document: PmpkDocumentState | null; error: string | null }
  // Neither the parse call nor the status check answered: the document state is unknown.
  | { known: false; error: string };

// A failed /parse says nothing reliable about the document (the file is already uploaded, the
// server may have marked it failed or may still be working), so the answer is always re-read.
export async function parseAndRefresh(id: string, action: "parse" | "retry"): Promise<ParseOutcome> {
  let failure: string;
  try {
    return { known: true, document: (await call(`/api/pmpk/${id}/${action}`, "POST")).document, error: null };
  } catch (error) {
    failure = error instanceof Error ? error.message : "Не удалось разобрать документ.";
  }
  try {
    // The parent has at most one document; if it was reset elsewhere this reports null, not an error.
    const { document } = await call("/api/pmpk");
    const explained = document?.status === "failed" || document?.status === "parsing" || document?.status === "needs_review";
    return { known: true, document, error: explained ? null : failure };
  } catch {
    return { known: false, error: statusCheckFailed };
  }
}
