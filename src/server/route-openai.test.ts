import { afterEach, describe, expect, it, vi } from "vitest";
import { caseAAnswers } from "@/domain/fixtures/cases";
import { generateWithOpenAI } from "./route-openai";

const answers = { ...caseAAnswers, CURRENT_SERVICES: "none" };
const config = { apiKey: "test-only-key", model: "test-model" };
afterEach(() => vi.unstubAllGlobals());

describe("OpenAI route generation", () => {
  it("uses strict outputs and sends only anonymized context", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
      selected_actions: [{ action_id: "PMPK_APPLY", priority: "high", rationale: "Подайте заявление для получения рекомендаций по поддержке ребёнка." }],
    }) }] }] }));
    vi.stubGlobal("fetch", fetch);
    const route = await generateWithOpenAI(answers, config);
    expect(route.steps[0].action_id).toBe("PMPK_APPLY");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.input).not.toContain("Бостандыкский");
  });
  it.each([
    [{ status: "incomplete", output: [] }, "openai_incomplete"],
    [{ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }, "openai_refusal"],
    [{ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] }, "invalid_model_output"],
  ])("handles invalid provider responses", async (response, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
    await expect(generateWithOpenAI(answers, config)).rejects.toMatchObject({ code });
  });
  it("does not retry or leak a provider error", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "secret provider details" }, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(generateWithOpenAI(answers, config)).rejects.toMatchObject({ code: "openai_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
