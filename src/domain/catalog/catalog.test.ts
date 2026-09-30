import { describe, expect, it } from "vitest";

import { catalogV1 } from "./v1";

const ids = catalogV1.actions.map((action) => action.action_id);

describe("service catalog v1", () => {
  it("has 10–15 actions with unique ids", () => {
    expect(ids.length).toBeGreaterThanOrEqual(10);
    expect(ids.length).toBeLessThanOrEqual(15);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references only existing prerequisite actions, without cycles", () => {
    const prerequisites = new Map(catalogV1.actions.map((action) => [action.action_id, action.prerequisites.actions]));
    for (const [id, required] of prerequisites) for (const other of required) expect(ids, `${id} → ${other}`).toContain(other);
    const reaches = (from: string, target: string, seen = new Set<string>()): boolean =>
      (prerequisites.get(from) ?? []).some((next) => next === target || (!seen.has(next) && (seen.add(next), reaches(next, target, seen))));
    for (const id of ids) expect(reaches(id, id), id).toBe(false);
  });

  it("cites a primary source for every statutory deadline and never for an internal one", () => {
    for (const { action_id, deadline } of catalogV1.actions) {
      if (deadline.kind === "internal_target") expect(deadline.source.url, action_id).toBeNull();
      else expect(deadline.source.url, action_id).toMatch(/^https:\/\/adilet\.zan\.kz\//);
    }
  });

  it("gives every action a neutral template explanation and documents with stable ids", () => {
    for (const action of catalogV1.actions) {
      expect(action.explanation_template.length).toBeGreaterThan(20);
      expect(action.explanation_template).not.toMatch(/диагноз|аутизм|РАС|ЗПР|умственн/i);
      for (const document of action.documents) expect(document.document_id).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("keeps MSE behind a curator-confirmed referral", () => {
    for (const id of ["MSE_PREPARE", "MSE_COMPLETE"]) {
      const action = catalogV1.actions.find((item) => item.action_id === id)!;
      expect(action.prerequisites.facts).toContain("mse_referral_confirmed");
      expect(catalogV1.actions.some((item) => item.provides_facts.includes("mse_referral_confirmed"))).toBe(false);
    }
  });
});
