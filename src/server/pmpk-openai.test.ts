import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePmpkDocument } from "./pmpk-openai";

const config = { apiKey: "test-only-key", model: "test-model" };
const answer = {
  document_type: "PMPK_CONCLUSION", issued_on: "2026-04-24", consultation_on: "2026-04-23", issuer: null, next_route: "KPPK",
  specialists: ["defectolog", "logoped"], support_format: "individual_development_program", sessions_per_week: null,
  source_quotes: [
    { field: "next_route", quote: "КППК" }, { field: "specialists", quote: "дефектолог, логопед" },
    { field: "support_format", quote: "индивидуальная программа" },
  ],
};
const reply = (payload: unknown) => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }] });
afterEach(() => vi.unstubAllGlobals());

describe("OpenAI PMPK recognition", () => {
  it("sends a PDF as a file and an image as an image, with strict output and no storage", async () => {
    const fetch = vi.fn().mockImplementation(async () => reply(answer));
    vi.stubGlobal("fetch", fetch);
    await parsePmpkDocument({ bytes: new TextEncoder().encode("%PDF-1.7"), mime: "application/pdf" }, config);
    await parsePmpkDocument({ bytes: Uint8Array.from([0x89, 0x50]), mime: "image/png" }, config);
    const [pdf, image] = fetch.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(pdf.input[0].content[1]).toMatchObject({ type: "input_file", filename: "document.pdf" });
    expect(pdf.input[0].content[1].file_data).toMatch(/^data:application\/pdf;base64,/);
    expect(image.input[0].content[1]).toMatchObject({ type: "input_image" });
    for (const body of [pdf, image]) {
      expect(body.store).toBe(false);
      expect(body.text.format.strict).toBe(true);
      expect(body.instructions).toMatch(/null/);
    }
  });
  it("returns the sanitised extraction and the model used", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => reply({ ...answer, sessions_per_week: 4 })));
    const result = await parsePmpkDocument({ bytes: new TextEncoder().encode("%PDF-"), mime: "application/pdf" }, config);
    expect(result).toMatchObject({ model: "test-model", schemaVersion: "pmpk-extraction-1" });
    expect(result.extraction.sessions_per_week).toBeNull();
    expect(result.extraction.dropped_fields).toContain("sessions_per_week");
  });
  it.each([
    [{ status: "incomplete", output: [] }, "openai_incomplete"],
    [{ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }, "openai_refusal"],
    [{ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{\"diagnosis\":\"x\"}" }] }] }, "invalid_model_output"],
  ])("maps provider problems to stable codes", async (response, code) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(response)));
    await expect(parsePmpkDocument({ bytes: new Uint8Array([1]), mime: "image/jpeg" }, config)).rejects.toMatchObject({ code });
  });
});
