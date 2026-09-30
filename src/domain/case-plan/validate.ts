import { isDeepStrictEqual } from "node:util";

import type { FactId } from "../conditions";
import type { ActionDefinition, ServiceCatalog } from "../catalog/types";
import { casePlanSchema, TERMINAL_STEP_STATUSES, type CasePlan, type CaseStep, type StepStatus } from "./schema";

export type PlanIssue = { path: string; code: string; message: string };
export type PlanValidation = { ok: true; plan: CasePlan } | { ok: false; issues: PlanIssue[] };

export type ValidationContext = {
  catalogs: ServiceCatalog[];
  // Curator-confirmed facts of the case (cases.confirmed_facts_json).
  facts: Partial<Record<FactId, boolean>>;
};

// Statuses that mean the step is being worked on; they need every prerequisite met.
const ACTIVE: readonly StepStatus[] = ["ready", "submitted", "scheduled", "in_progress", "waiting_external", "completed"];

// Full contract check: JSON shape first, then invariants the schema cannot express.
export function validateCasePlan(input: unknown, context: ValidationContext): PlanValidation {
  const parsed = casePlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: "schema", message: issue.message })),
    };
  }
  const plan = parsed.data;
  const issues: PlanIssue[] = [];
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message });

  const catalog = context.catalogs.find((item) => item.catalog_version === plan.catalog_version);
  if (!catalog) {
    add("catalog_version", "unknown_catalog", `Catalog version ${plan.catalog_version} is not published`);
    return { ok: false, issues };
  }
  const definitions = new Map(catalog.actions.map((action) => [action.action_id, action]));
  const steps = new Map<string, CaseStep>();
  const actionsInPlan = new Set<string>();

  plan.steps.forEach((step, index) => {
    const path = `steps.${index}`;
    if (steps.has(step.step_id)) add(`${path}.step_id`, "duplicate_step", `Duplicate step_id ${step.step_id}`);
    steps.set(step.step_id, step);
    if (actionsInPlan.has(step.action_id)) add(`${path}.action_id`, "duplicate_action", `Action ${step.action_id} appears twice`);
    actionsInPlan.add(step.action_id);
    const definition = definitions.get(step.action_id);
    if (!definition) add(`${path}.action_id`, "unknown_action", `Action ${step.action_id} is not in catalog ${catalog.catalog_version}`);
    else checkCatalogFields(step, definition, path, add);
  });

  plan.steps.forEach((step, index) => {
    const path = `steps.${index}`;
    for (const dependency of step.depends_on) {
      if (dependency === step.step_id) add(`${path}.depends_on`, "self_dependency", "A step cannot depend on itself");
      else if (!steps.has(dependency)) add(`${path}.depends_on`, "missing_dependency", `Unknown step ${dependency}`);
    }
    const definition = definitions.get(step.action_id);
    if (definition) checkPrerequisites(step, definition, plan.steps, path, add);
    checkStatus(step, steps, context.facts, plan, path, add);
  });

  const cycle = findCycle(plan.steps);
  if (cycle) add("steps", "dependency_cycle", `Dependency cycle: ${cycle.join(" → ")}`);
  checkApproval(plan, add);

  return issues.length ? { ok: false, issues } : { ok: true, plan };
}

type Add = (path: string, code: string, message: string) => void;

// Title, agency, responsible, documents and deadline rules come only from the catalog (clauses 11–12).
function checkCatalogFields(step: CaseStep, definition: ActionDefinition, path: string, add: Add) {
  const fields = ["title", "agency", "responsible", "documents"] as const;
  for (const field of fields) {
    if (!isDeepStrictEqual(step[field], definition[field])) add(`${path}.${field}`, "catalog_mismatch", `${field} differs from the catalog`);
  }
  const { kind, trigger, duration, source } = step.deadline;
  if (!isDeepStrictEqual({ kind, trigger, duration, source }, definition.deadline)) {
    add(`${path}.deadline`, "catalog_mismatch", "deadline rule differs from the catalog");
  }
  if (!isDeepStrictEqual([...step.requires_facts].sort(), [...definition.prerequisites.facts].sort())) {
    add(`${path}.requires_facts`, "catalog_mismatch", "requires_facts differ from the catalog");
  }
  if (step.explanation_source === "catalog_template" && step.explanation !== definition.explanation_template) {
    add(`${path}.explanation`, "template_mismatch", "catalog_template explanation must equal the catalog text");
  }
}

// A prerequisite action present in the plan must be an explicit dependency (clause 9).
function checkPrerequisites(step: CaseStep, definition: ActionDefinition, all: CaseStep[], path: string, add: Add) {
  for (const actionId of definition.prerequisites.actions) {
    const prerequisite = all.find((item) => item.action_id === actionId);
    if (prerequisite && !step.depends_on.includes(prerequisite.step_id)) {
      add(`${path}.depends_on`, "missing_prerequisite", `Step must depend on ${prerequisite.step_id} (${actionId})`);
    }
  }
}

function checkStatus(
  step: CaseStep, steps: Map<string, CaseStep>, facts: ValidationContext["facts"], plan: CasePlan, path: string, add: Add,
) {
  const unmetDependency = step.depends_on.some((id) => steps.get(id)?.status !== "completed");
  const missingFact = step.requires_facts.some((fact) => facts[fact] !== true);
  if ((unmetDependency || missingFact) && ACTIVE.includes(step.status)) {
    add(`${path}.status`, "unmet_prerequisite", `Status ${step.status} requires completed dependencies and confirmed facts`);
  }
  if (plan.plan_status !== "approved" && !["draft", "blocked"].includes(step.status)) {
    add(`${path}.status`, "status_before_approval", "Before approval steps are only draft or blocked");
  }
  if (plan.plan_status === "approved" && step.status === "draft") {
    add(`${path}.status`, "draft_after_approval", "Approval turns draft steps into ready");
  }
  if (step.status === "completed" && !step.completed_at) add(`${path}.completed_at`, "missing_timestamp", "completed_at is required");
  if (["submitted", "waiting_external", "scheduled"].includes(step.status) && !step.submitted_at) {
    add(`${path}.submitted_at`, "missing_timestamp", "submitted_at is required once submitted");
  }
  const terminal = (TERMINAL_STEP_STATUSES as readonly string[]).includes(step.status);
  if (!step.deadline.due_at && step.overdue.is_overdue) add(`${path}.overdue`, "overdue_without_due", "No due_at, cannot be overdue");
  if (terminal && step.overdue.is_overdue) add(`${path}.overdue`, "terminal_overdue", "A terminal step is never overdue");
  if (step.deadline.kind === "service_duration" && step.overdue.is_overdue) {
    add(`${path}.overdue`, "service_duration_overdue", "Service duration is not a deadline");
  }
  if (step.deadline.due_at && !step.deadline.trigger_at) add(`${path}.deadline`, "due_without_trigger", "due_at needs trigger_at");
  const escalated = step.escalation.state === "curator_attention_required";
  if (escalated !== step.overdue.is_overdue) add(`${path}.escalation`, "escalation_mismatch", "Escalation follows overdue");
}

function checkApproval(plan: CasePlan, add: Add) {
  const { approval } = plan;
  if (plan.plan_status === "approved") {
    if (approval.status !== "approved" || !approval.curator_id || !approval.approved_at || !approval.plan_revision) {
      add("approval", "incomplete_approval", "Approved plan needs curator, time and revision");
    }
  } else if (plan.plan_status !== "closed") {
    if (approval.status !== "pending" || approval.curator_id || approval.approved_at || approval.plan_revision) {
      add("approval", "premature_approval", "Unapproved plan cannot carry approval data");
    }
  }
}

function findCycle(steps: CaseStep[]): string[] | null {
  const byId = new Map(steps.map((step) => [step.step_id, step]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, "visiting");
    stack.push(id);
    for (const next of byId.get(id)?.depends_on ?? []) {
      if (next === id || !byId.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const step of steps) {
    const cycle = visit(step.step_id);
    if (cycle) return cycle;
  }
  return null;
}
