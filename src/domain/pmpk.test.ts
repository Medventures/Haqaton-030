import { describe, expect, it } from "vitest";
import { caseAAnswers } from "./fixtures/cases";
import { allowedActions, assembleRoute, modelContext } from "./parent-route";
import { confirmProblem, confirmSchema, maskIdentifiers, routeInputsFromDocument, sanitizeExtraction, sniffMime, type RouteInputs } from "./pmpk";

const now = new Date("2026-09-30T10:00:00Z");
// The example from the intake plan: issue date differs from the consultation date; no frequency in the document.
const modelOutput = {
  document_type: "PMPK_CONCLUSION", issued_on: "2026-04-24", consultation_on: "2026-04-23", issuer: "ПМПК г. Астана",
  next_route: "KPPK", specialists: ["defectolog", "logoped"], support_format: "individual_development_program", sessions_per_week: null,
  source_quotes: [
    { field: "next_route", quote: "направить в кабинет психолого-педагогической коррекции" },
    { field: "specialists", quote: "занятия с дефектологом и логопедом" },
    { field: "support_format", quote: "индивидуальная развивающая программа" },
  ],
};

describe("PMPK extraction", () => {
  it("keeps both dates and leaves the missing frequency empty", () => {
    const result = sanitizeExtraction(modelOutput, now);
    expect(result).toMatchObject({ issued_on: "2026-04-24", consultation_on: "2026-04-23", sessions_per_week: null, dropped_fields: [] });
    expect(result.specialists).toEqual(["defectolog", "logoped"]);
  });
  it("drops recommendations that have no supporting quote", () => {
    const result = sanitizeExtraction({ ...modelOutput, sessions_per_week: 3, source_quotes: [modelOutput.source_quotes[0]] }, now);
    expect(result).toMatchObject({ sessions_per_week: null, specialists: [], support_format: null, next_route: "KPPK" });
    expect(result.dropped_fields).toEqual(["specialists", "support_format", "sessions_per_week"]);
  });
  it("does not let the model invent a frequency even with a quote for another field", () => {
    const result = sanitizeExtraction({ ...modelOutput, sessions_per_week: 5 }, now);
    expect(result.sessions_per_week).toBeNull();
    expect(result.dropped_fields).toContain("sessions_per_week");
  });
  it("empties implausible dates instead of trusting them", () => {
    expect(sanitizeExtraction({ ...modelOutput, issued_on: "2031-01-01" }, now)).toMatchObject({ issued_on: null, consultation_on: "2026-04-23" });
    expect(sanitizeExtraction({ ...modelOutput, issued_on: "2026-04-20" }, now)).toMatchObject({ issued_on: "2026-04-20", consultation_on: null });
    expect(sanitizeExtraction({ ...modelOutput, issued_on: "2026-02-30" }, now)).toMatchObject({ issued_on: null, consultation_on: "2026-04-23", dropped_fields: ["issued_on"] });
  });
  it("rejects a shape the schema does not allow", () => {
    expect(() => sanitizeExtraction({ ...modelOutput, diagnosis: "text" }, now)).toThrow();
    expect(() => sanitizeExtraction({ ...modelOutput, specialists: ["neurosurgeon"] }, now)).toThrow();
  });
  it("masks identifier-like digit runs in quotes", () => {
    expect(maskIdentifiers("ИИН 123456789012, дата 23.04.2026")).toBe("ИИН •••, дата 23.04.2026");
    const result = sanitizeExtraction({ ...modelOutput, source_quotes: [{ field: "next_route", quote: "ИИН 123456789012 направить в КППК" }, ...modelOutput.source_quotes.slice(1)] }, now);
    expect(JSON.stringify(result.source_quotes)).not.toContain("123456789012");
  });
});

describe("parent confirmation", () => {
  const fields = { ...modelOutput, source_quotes: undefined };
  delete (fields as { source_quotes?: unknown }).source_quotes;
  it("accepts only the reviewable fields, never quotes or extra keys", () => {
    expect(confirmSchema.safeParse({ revision: 1, confirmed: fields }).success).toBe(true);
    expect(confirmSchema.safeParse({ revision: 1, confirmed: { ...fields, diagnosis: "x" } }).success).toBe(false);
    expect(confirmSchema.safeParse({ revision: 0, confirmed: fields }).success).toBe(false);
  });
  it("lets only a dated PMPK conclusion steer the route", () => {
    const parsed = confirmSchema.parse({ revision: 1, confirmed: fields }).confirmed;
    expect(confirmProblem(parsed, now)).toBeNull();
    expect(confirmProblem({ ...parsed, document_type: "OTHER" }, now)).toBe("not_pmpk_conclusion");
    expect(confirmProblem({ ...parsed, issued_on: null, consultation_on: null }, now)).toBe("date_required");
    expect(confirmProblem({ ...parsed, consultation_on: "2026-05-01" }, now)).toBe("consultation_after_issue");
  });
});

describe("file signature", () => {
  it("trusts the bytes, not the declared type", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});

describe("confirmed PMPK and the route", () => {
  const answers = { ...caseAAnswers, CURRENT_SERVICES: "none" };
  const conclusion = (next_route: "KPPK" | "OTHER" | null, revision = 1): RouteInputs => ({
    pmpk_conclusion_confirmed: true,
    pmpk: { document_id: "doc-1", revision, next_route, specialists: ["defectolog", "logoped"], support_format: "individual_development_program" },
  });
  const pick = (id: string) => ({ selected_actions: [{ action_id: id, priority: "high", rationale: "Передайте заключение и получите поддержку для ребёнка." }] });
  const row = (status: string, confirmed_json: object | null, confirmed_revision = 1) => ({ id: "doc-1", status, confirmed_revision, confirmed_json });

  it("takes route inputs only from a confirmed PMPK conclusion, with its id, revision and recommendations", () => {
    expect(routeInputsFromDocument(null)).toEqual({ pmpk_conclusion_confirmed: false, pmpk: null });
    expect(routeInputsFromDocument(row("needs_review", { document_type: "PMPK_CONCLUSION" })).pmpk).toBeNull();
    expect(routeInputsFromDocument(row("confirmed", { document_type: "OTHER" })).pmpk).toBeNull();
    expect(routeInputsFromDocument(row("confirmed", { ...modelOutput, source_quotes: undefined }, 3))).toEqual(conclusion("KPPK", 3));
    // Missing keys are normalised exactly like public.parent_facts() does.
    expect(routeInputsFromDocument(row("confirmed", { document_type: "PMPK_CONCLUSION" })).pmpk)
      .toEqual({ document_id: "doc-1", revision: 1, next_route: null, specialists: [], support_format: null });
  });
  it("removes the PMPK stage and unblocks the KPPK step only when the conclusion refers to KPPK", () => {
    const before = assembleRoute(pick("EDU_REHAB_APPLY"), answers, "test", now);
    expect(before.steps[0]).toMatchObject({ action_id: "EDU_REHAB_APPLY", status: "blocked" });
    const kppk = assembleRoute(pick("EDU_REHAB_APPLY"), answers, "test", now, conclusion("KPPK"));
    expect(kppk.steps[0]).toMatchObject({ action_id: "EDU_REHAB_APPLY", status: "ready", requirements: [] });
    expect(allowedActions(answers, conclusion("KPPK")).map((action) => action.action_id)).not.toContain("PMPK_APPLY");
    expect(allowedActions(answers).map((action) => action.action_id)).toContain("PMPK_APPLY");
  });
  it.each([["OTHER" as const], [null]])("keeps the KPPK step blocked when the direction is %s", (direction) => {
    const route = assembleRoute(pick("EDU_REHAB_APPLY"), answers, "test", now, conclusion(direction));
    expect(route.steps[0]).toMatchObject({ status: "blocked", requirements: ["В подтверждённом заключении ПМПК нет направления в КППК"] });
  });
  it("gives the model the confirmed recommendations as codes, nothing personal", () => {
    const context = modelContext(answers, conclusion("KPPK", 7));
    expect(context).toMatchObject({
      pmpk_conclusion_confirmed: true,
      pmpk_recommendations: { next_route: "KPPK", specialists: ["defectolog", "logoped"], support_format: "individual_development_program" },
    });
    expect(JSON.stringify(context)).not.toMatch(/doc-1|2026-04/);
    expect(modelContext(answers)).toMatchObject({ pmpk_conclusion_confirmed: false, pmpk_recommendations: null });
  });
});
