import type { Condition, FactId } from "../conditions";

export const DEADLINE_TRIGGERS = [
  "plan_approved",
  "self_submitted",
  "pmpk_application_submitted",
  "pmpk_conclusion_confirmed",
  "prerequisite_completed",
] as const;
export type DeadlineTrigger = (typeof DEADLINE_TRIGGERS)[number];

export type DeadlineSource = { title: string; url: string | null; clause: string | null };

export type DeadlineRule =
  | {
    kind: "statutory" | "internal_target";
    trigger: DeadlineTrigger;
    duration: { amount: number; unit: "working_days" | "calendar_days" };
    source: DeadlineSource;
  }
  | {
    // A service's own length, not a deadline: it never makes a step overdue.
    kind: "service_duration";
    trigger: DeadlineTrigger;
    duration: { min_days: number; max_days: number };
    source: DeadlineSource;
  };

export type ResponsibleRole = "parent" | "curator" | "agency";

export type CatalogDocument = { document_id: string; title: string; required: boolean };

export type ActionDefinition = {
  action_id: string;
  title: string;
  agency: string;
  responsible: { role: ResponsibleRole; label: string };
  documents: CatalogDocument[];
  // Hard basis: when false the action is not allowed at all (spec clause 8).
  eligibility: Condition;
  // Satisfiable prerequisites: a missing one makes the step `blocked` (spec clause 9).
  prerequisites: { actions: string[]; facts: FactId[] };
  // Facts a curator confirms when this action is completed; lets dependent steps wait for it.
  provides_facts: FactId[];
  deadline: DeadlineRule;
  parent_can_complete: boolean;
  // Pre-reviewed text used when the model's explanation is rejected (explanation_source = catalog_template).
  explanation_template: string;
};

export type ServiceCatalog = {
  catalog_version: string;
  effective_from: string;
  actions: ActionDefinition[];
};
