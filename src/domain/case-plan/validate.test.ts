import { describe, expect, it } from "vitest";

import { catalogV1 } from "../catalog/v1";
import { caseAPlan, caseBPlan } from "../fixtures/cases";
import { validateCasePlan } from "./validate";

const context = { catalogs: [catalogV1], facts: {} };
const clone = <T>(value: T): T => structuredClone(value);
const codes = (input: unknown) => {
  const result = validateCasePlan(input, context);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};

describe("validateCasePlan", () => {
  it.each([["A", caseAPlan], ["B", caseBPlan]])("accepts fixture %s", (_, plan) => {
    expect(validateCasePlan(plan, context)).toEqual({ ok: true, plan });
  });

  it("rejects a diagnosis field anywhere", () => {
    expect(codes({ ...clone(caseAPlan), diagnosis: "" })).toEqual(["schema"]);
    const plan = clone(caseAPlan);
    (plan.steps[0] as Record<string, unknown>).diagnosis = "x";
    expect(codes(plan)).toEqual(["schema"]);
  });

  it("rejects an action outside the catalog", () => {
    const plan = clone(caseAPlan);
    plan.steps[0].action_id = "INVENTED_SERVICE";
    expect(codes(plan)).toContain("unknown_action");
  });

  it("rejects an unknown catalog version", () => {
    expect(codes({ ...clone(caseAPlan), catalog_version: "1999-01-01.1" })).toEqual(["unknown_catalog"]);
  });

  it("rejects catalog fields changed in the plan", () => {
    const plan = clone(caseAPlan);
    plan.steps[1].title = "Своя формулировка";
    plan.steps[1].deadline.source.url = "https://example.com";
    expect(codes(plan)).toEqual(["catalog_mismatch", "catalog_mismatch"]);
  });

  it("rejects a template explanation that differs from the catalog", () => {
    const plan = clone(caseAPlan);
    plan.steps[0].explanation = "Другой текст объяснения для семьи";
    expect(codes(plan)).toEqual(["template_mismatch"]);
  });

  it("rejects cycles, unknown and missing dependencies", () => {
    const cycle = clone(caseAPlan);
    cycle.steps[1].depends_on = ["s5"];
    expect(codes(cycle)).toContain("dependency_cycle");

    const unknown = clone(caseAPlan);
    unknown.steps[0].depends_on = ["s9"];
    expect(codes(unknown)).toContain("missing_dependency");

    const missing = clone(caseAPlan);
    missing.steps[2].depends_on = [];
    expect(codes(missing)).toContain("missing_prerequisite");
  });

  it("rejects duplicate steps and actions", () => {
    const plan = clone(caseAPlan);
    plan.steps.push({ ...clone(plan.steps[0]) });
    expect(codes(plan)).toEqual(expect.arrayContaining(["duplicate_step", "duplicate_action"]));
  });

  it("keeps a step blocked until dependencies complete and facts are confirmed", () => {
    const plan = clone(caseBPlan);
    plan.steps[1].status = "ready";
    expect(codes(plan)).toContain("unmet_prerequisite");

    const facts = clone(caseBPlan);
    facts.steps[0].status = "completed";
    facts.steps[0].completed_at = "2026-09-30T06:00:00Z";
    facts.steps[0].overdue = { is_overdue: false, days: 0 };
    facts.steps[0].escalation = { state: "none" };
    facts.steps[1].status = "completed";
    facts.steps[1].completed_at = "2026-09-30T07:00:00Z";
    facts.steps[2].status = "ready";
    expect(codes(facts)).toEqual(["unmet_prerequisite"]);
    expect(validateCasePlan(facts, { ...context, facts: { pmpk_conclusion_confirmed: true } }).ok).toBe(true);
  });

  it("allows only draft and blocked steps before approval", () => {
    const plan = clone(caseAPlan);
    plan.steps[0].status = "ready";
    expect(codes(plan)).toEqual(["status_before_approval"]);
  });

  it("requires consistent approval data", () => {
    const approvedWithoutCurator = clone(caseBPlan);
    approvedWithoutCurator.approval.curator_id = null;
    expect(codes(approvedWithoutCurator)).toEqual(["incomplete_approval"]);

    const pendingWithApproval = clone(caseAPlan);
    pendingWithApproval.approval.approved_at = "2026-09-30T08:00:00Z";
    expect(codes(pendingWithApproval)).toEqual(["premature_approval"]);
  });

  it("never marks terminal or undated steps overdue", () => {
    const plan = clone(caseAPlan);
    plan.steps[0].overdue = { is_overdue: true, days: 1 };
    plan.steps[0].escalation = { state: "curator_attention_required" };
    expect(codes(plan)).toEqual(["overdue_without_due"]);
  });
});
