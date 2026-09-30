import { z } from "zod";

import { FACT_IDS } from "../conditions";
import { DEADLINE_TRIGGERS } from "../catalog/types";

// Canonical CasePlan v1 (@.archcore/case-plan-contract.spec.md). Every object is strict:
// an unknown key such as `diagnosis` fails validation instead of being stored silently.

export const CASE_PLAN_SCHEMA_VERSION = "1";

export const STEP_STATUSES = [
  "draft", "ready", "submitted", "scheduled", "in_progress", "waiting_external", "blocked", "completed", "cancelled",
] as const;
export const TERMINAL_STEP_STATUSES = ["completed", "cancelled"] as const;
export const PLAN_STATUSES = ["pending_curator", "approved", "returned_for_revision", "closed"] as const;
export const WORKFLOW_STATES = [
  "interview_in_progress", "generating", "generation_failed", "pending_curator", "returned_for_revision", "approved",
] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;

export type StepStatus = (typeof STEP_STATUSES)[number];
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

const timestamp = z.iso.datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();

const source = z.strictObject({
  title: z.string().min(1),
  url: z.url().nullable(),
  clause: z.string().min(1).nullable(),
});

const deadlineBase = {
  trigger: z.enum(DEADLINE_TRIGGERS),
  trigger_at: nullableTimestamp,
  due_at: nullableTimestamp,
  source,
};

const deadline = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.enum(["statutory", "internal_target"]),
    duration: z.strictObject({
      amount: z.int().positive(),
      unit: z.enum(["working_days", "calendar_days"]),
    }),
    ...deadlineBase,
  }),
  z.strictObject({
    kind: z.literal("service_duration"),
    duration: z.strictObject({ min_days: z.int().positive(), max_days: z.int().positive() }),
    ...deadlineBase,
  }),
]);

export const caseStepSchema = z.strictObject({
  step_id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  action_id: z.string().regex(/^[A-Z][A-Z0-9_]{2,60}$/),
  title: z.string().min(1),
  agency: z.string().min(1),
  priority: z.enum(PRIORITIES),
  responsible: z.strictObject({ role: z.enum(["parent", "curator", "agency"]), label: z.string().min(1) }),
  explanation: z.string().min(20).max(600),
  explanation_source: z.enum(["ai", "catalog_template"]),
  depends_on: z.array(z.string()),
  requires_facts: z.array(z.enum(FACT_IDS)),
  documents: z.array(z.strictObject({ document_id: z.string().min(1), title: z.string().min(1), required: z.boolean() })),
  deadline,
  status: z.enum(STEP_STATUSES),
  status_updated_at: timestamp,
  submitted_at: nullableTimestamp,
  completed_at: nullableTimestamp,
  overdue: z.strictObject({ is_overdue: z.boolean(), days: z.int().nonnegative() }),
  escalation: z.strictObject({ state: z.enum(["none", "curator_attention_required"]) }),
});

export const casePlanSchema = z.strictObject({
  schema_version: z.literal(CASE_PLAN_SCHEMA_VERSION),
  catalog_version: z.string().min(1),
  case_id: z.uuid(),
  jurisdiction: z.literal("KZ"),
  created_at: timestamp,
  plan_status: z.enum(PLAN_STATUSES),
  profile: z.strictObject({
    child_age_years: z.int().min(0).max(17),
    age_band: z.enum(["0-2", "3-6", "7-13", "14-17"]),
    region_code: z.string().regex(/^KZ-(\d{2}|OTHER)$/),
    education_stage: z.enum(["none", "kindergarten", "school"]),
    support_goals: z.array(z.string().min(1)).max(7),
  }),
  approval: z.strictObject({
    required: z.literal(true),
    status: z.enum(["pending", "approved"]),
    curator_id: z.uuid().nullable(),
    approved_at: nullableTimestamp,
    plan_revision: z.int().positive().nullable(),
  }),
  steps: z.array(caseStepSchema).min(1),
});

export type CaseStep = z.infer<typeof caseStepSchema>;
export type CasePlan = z.infer<typeof casePlanSchema>;
