import { describe, expect, it } from "vitest";

import { checkTransition, type TransitionStep } from "./transitions";

const parentStep: TransitionStep = { status: "ready", responsibleRole: "parent", parentCanComplete: true };
const agencyStep: TransitionStep = { status: "ready", responsibleRole: "agency", parentCanComplete: false };

describe("checkTransition", () => {
  it("lets a parent record their own submission", () => {
    expect(checkTransition(parentStep, "submitted", "parent")).toEqual({ allowed: true });
    expect(checkTransition(agencyStep, "submitted", "parent")).toEqual({ allowed: false, reason: "actor_not_allowed" });
  });

  it("lets a parent complete only self-contained actions", () => {
    expect(checkTransition(parentStep, "completed", "parent").allowed).toBe(true);
    expect(checkTransition(agencyStep, "completed", "parent").allowed).toBe(false);
    expect(checkTransition(agencyStep, "completed", "curator").allowed).toBe(true);
  });

  it("keeps curator-only transitions from parents", () => {
    for (const to of ["waiting_external", "scheduled", "in_progress", "cancelled"] as const) {
      const from = { ...parentStep, status: to === "scheduled" || to === "waiting_external" ? "submitted" as const : "ready" as const };
      expect(checkTransition(from, to, "parent").allowed, to).toBe(false);
      expect(checkTransition(from, to, "curator").allowed, to).toBe(true);
    }
  });

  it("refuses leaving terminal statuses and skipping prerequisites", () => {
    for (const status of ["completed", "cancelled"] as const) {
      for (const to of ["ready", "submitted", "in_progress", "completed"] as const) {
        expect(checkTransition({ ...parentStep, status }, to, "curator")).toEqual({ allowed: false, reason: "not_in_whitelist" });
      }
    }
    expect(checkTransition({ ...parentStep, status: "blocked" }, "completed", "curator").allowed).toBe(false);
    expect(checkTransition({ ...parentStep, status: "draft" }, "submitted", "curator").allowed).toBe(false);
    expect(checkTransition({ ...parentStep, status: "blocked" }, "cancelled", "curator").allowed).toBe(true);
  });
});
