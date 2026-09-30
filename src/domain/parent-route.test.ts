import { describe, expect, it } from "vitest";
import { caseAAnswers } from "./fixtures/cases";
import { allowedActions, assembleRoute, modelContext } from "./parent-route";

const answers = { ...caseAAnswers, CURRENT_SERVICES: "none" };
const selected = (action_id = "PMPK_APPLY", rationale = "Подайте заявление, чтобы получить рекомендации по поддержке ребёнка.") => ({
  selected_actions: [{ action_id, priority: "high", rationale }],
});

describe("parent route", () => {
  it("does not send free-text places or exact age to the model", () => {
    const context = modelContext({ ...answers, RESIDENCE: { city: "sensitive", district: "private" } });
    expect(JSON.stringify(context)).not.toMatch(/sensitive|private/);
    expect(context).toHaveProperty("age_band", "0-2");
    expect(context).not.toHaveProperty("AGE");
  });
  it("rejects an incomplete interview", () => {
    expect(() => modelContext({})).toThrow("interview_incomplete");
  });
  it("does not invent legal grounds for MSE or social services", () => {
    const actions = allowedActions({ ...answers, DISABILITY_STATUS: "in_progress" });
    expect(actions.some((action) => action.action_id.startsWith("MSE"))).toBe(false);
  });
  it("copies authoritative fields from the catalog", () => {
    const route = assembleRoute(selected(), answers, "test", new Date("2026-09-30T10:00:00Z"));
    expect(route.steps[0]).toMatchObject({ action_id: "PMPK_APPLY", status: "ready", explanation_source: "ai" });
    expect(route.generated_at).toBe("2026-09-30T10:00:00.000Z");
  });
  it("adds prerequisites before dependent steps and identifies template text", () => {
    const route = assembleRoute(selected("PMPK_ATTEND"), answers, "test");
    expect(route.steps.map((step) => step.action_id)).toEqual(["PMPK_APPLY", "PMPK_WAIT_APPOINTMENT", "PMPK_ATTEND"]);
    expect(route.steps[0].explanation_source).toBe("catalog_template");
    expect(route.steps[2]).toMatchObject({ status: "blocked", depends_on: ["PMPK_WAIT_APPOINTMENT"] });
  });
  it.each(["У ребёнка диагностирован аутизм, поэтому необходима помощь.", "Вы записаны на приём. Заявка отправлена в центр."])("rejects unsafe or fictional model text", (text) => {
    expect(() => assembleRoute(selected("PMPK_APPLY", text), answers, "test")).toThrow("invalid_explanation");
  });
  it("rejects unknown actions and duplicate actions", () => {
    expect(() => assembleRoute(selected("MADE_UP_ACTION"), answers, "test")).toThrow("invalid_action");
    const input = selected(); input.selected_actions.push(input.selected_actions[0]);
    expect(() => assembleRoute(input, answers, "test")).toThrow("invalid_action");
  });
});
