import type { StepStatus } from "./schema";

// User-triggered step transitions (spec "Step Transitions"). A whitelist: anything not listed is refused.
// Server-driven changes (generation, approval draft → ready, unblocking) are not user operations.

export type Actor = "parent" | "curator";

type Rule = { from: readonly StepStatus[]; to: StepStatus; actors: readonly Actor[] };

const WORKING: readonly StepStatus[] = ["ready", "submitted", "scheduled", "in_progress", "waiting_external"];

const RULES: readonly Rule[] = [
  { from: ["ready"], to: "submitted", actors: ["parent", "curator"] },
  { from: ["submitted"], to: "waiting_external", actors: ["curator"] },
  { from: ["submitted", "waiting_external"], to: "scheduled", actors: ["curator"] },
  { from: ["ready", "scheduled"], to: "in_progress", actors: ["curator"] },
  { from: WORKING, to: "completed", actors: ["parent", "curator"] },
  { from: [...WORKING, "draft", "blocked"], to: "cancelled", actors: ["curator"] },
];

export type TransitionStep = {
  status: StepStatus;
  responsibleRole: "parent" | "curator" | "agency";
  parentCanComplete: boolean;
};

export type TransitionCheck = { allowed: true } | { allowed: false; reason: "not_in_whitelist" | "actor_not_allowed" };

export function checkTransition(step: TransitionStep, to: StepStatus, actor: Actor): TransitionCheck {
  const rule = RULES.find((item) => item.to === to && item.from.includes(step.status));
  if (!rule) return { allowed: false, reason: "not_in_whitelist" };
  if (!rule.actors.includes(actor)) return { allowed: false, reason: "actor_not_allowed" };
  if (actor === "parent") {
    // A parent only records their own action, and completes only self-contained actions.
    if (to === "submitted" && step.responsibleRole !== "parent") return { allowed: false, reason: "actor_not_allowed" };
    if (to === "completed" && !step.parentCanComplete) return { allowed: false, reason: "actor_not_allowed" };
  }
  return { allowed: true };
}
