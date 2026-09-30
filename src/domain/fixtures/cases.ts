import { catalogV1 } from "../catalog/v1";
import type { CasePlan, CaseStep } from "../case-plan/schema";

// Synthetic demo cases A and B (@.archcore/early-route-synthetic-case.scenario.md,
// @.archcore/pmpk-overdue-synthetic-case.scenario.md). All data is invented.
// Dates are fixed at the scenario date 30.09.2026; the demo seed shifts them (DEMO-03).

export const CASE_A_ID = "0a000000-0000-4000-8000-00000000000a";
export const CASE_B_ID = "0b000000-0000-4000-8000-00000000000b";
export const DEMO_CURATOR_ID = "0c000000-0000-4000-8000-00000000000c";

type StepInput = Pick<CaseStep, "step_id" | "priority" | "status" | "status_updated_at"> & Partial<CaseStep>;

// Catalog fields are copied, never typed by hand: the validator compares them with the catalog.
function step(actionId: string, input: StepInput): CaseStep {
  const definition = catalogV1.actions.find((action) => action.action_id === actionId);
  if (!definition) throw new Error(`Unknown action ${actionId}`);
  return {
    action_id: definition.action_id,
    title: definition.title,
    agency: definition.agency,
    responsible: definition.responsible,
    explanation: definition.explanation_template,
    explanation_source: "catalog_template",
    depends_on: [],
    requires_facts: [...definition.prerequisites.facts],
    documents: definition.documents,
    deadline: { ...definition.deadline, trigger_at: null, due_at: null },
    submitted_at: null,
    completed_at: null,
    overdue: { is_overdue: false, days: 0 },
    escalation: { state: "none" },
    ...input,
  };
}

// Case A: 2 years, Almaty, route not started. Interview done, draft waits for the curator.
export const caseAAnswers = {
  AGE: 2,
  RESIDENCE: { city: "Алматы", district: "Бостандыкский" },
  REGISTRATION: { same: true },
  COMPLETED_STAGES: ["none"],
  PMPK_STATUS: "no",
  DISABILITY_STATUS: "no",
  HELP_PREFERENCE: "state",
  CURRENT_HELP: "none",
  MAIN_PRIORITY: "start",
};

const generatedA = "2026-09-30T06:00:00Z";

export const caseAPlan: CasePlan = {
  schema_version: "1",
  catalog_version: catalogV1.catalog_version,
  case_id: CASE_A_ID,
  jurisdiction: "KZ",
  created_at: generatedA,
  plan_status: "pending_curator",
  profile: { child_age_years: 2, age_band: "0-2", region_code: "KZ-75", education_stage: "none", support_goals: ["start"] },
  approval: { required: true, status: "pending", curator_id: null, approved_at: null, plan_revision: null },
  steps: [
    step("MED_PHC_DEV_REVIEW", { step_id: "s1", priority: "high", status: "draft", status_updated_at: generatedA }),
    step("PMPK_APPLY", { step_id: "s2", priority: "medium", status: "draft", status_updated_at: generatedA }),
    step("PMPK_WAIT_APPOINTMENT", { step_id: "s3", priority: "low", status: "blocked", status_updated_at: generatedA, depends_on: ["s2"] }),
    step("PMPK_ATTEND", { step_id: "s4", priority: "low", status: "blocked", status_updated_at: generatedA, depends_on: ["s3"] }),
    step("EDU_REHAB_APPLY", { step_id: "s5", priority: "low", status: "blocked", status_updated_at: generatedA, depends_on: ["s4"] }),
  ],
};

// Case B: 7 years, Astana. PMPK application via portal on 21.09.2026 10:00 (UTC+5), no date by 30.09.2026.
export const caseBAnswers = {
  AGE: 7,
  RESIDENCE: { city: "Астана", district: "Есильский" },
  REGISTRATION: { same: true },
  EDUCATION_STAGE: "school",
  COMPLETED_STAGES: ["specialists"],
  PMPK_STATUS: "in_progress",
  PMPK_APPLICATION: { submitted_on: "2026-09-21", channel: "portal", appointment: "not_assigned" },
  DISABILITY_STATUS: "no",
  HELP_PREFERENCE: "state",
  CURRENT_HELP: "none",
  MAIN_PRIORITY: "pmpk",
};

const submittedB = "2026-09-21T05:00:00Z";
const approvedB = "2026-09-22T09:00:00Z";

export const caseBPlan: CasePlan = {
  schema_version: "1",
  catalog_version: catalogV1.catalog_version,
  case_id: CASE_B_ID,
  jurisdiction: "KZ",
  created_at: "2026-09-22T07:30:00Z",
  plan_status: "approved",
  profile: { child_age_years: 7, age_band: "7-13", region_code: "KZ-71", education_stage: "school", support_goals: ["pmpk"] },
  approval: { required: true, status: "approved", curator_id: DEMO_CURATOR_ID, approved_at: approvedB, plan_revision: 1 },
  steps: [
    step("PMPK_WAIT_APPOINTMENT", {
      step_id: "s1", priority: "high", status: "waiting_external", status_updated_at: approvedB,
      submitted_at: submittedB,
      // 2 working days after Mon 21.09 → end of Wed 23.09 in Asia/Almaty.
      deadline: { ...catalogDeadline("PMPK_WAIT_APPOINTMENT"), trigger_at: submittedB, due_at: "2026-09-23T18:59:59Z" },
      overdue: { is_overdue: true, days: 7 },
      escalation: { state: "curator_attention_required" },
    }),
    step("PMPK_ATTEND", {
      step_id: "s2", priority: "high", status: "blocked", status_updated_at: approvedB, depends_on: ["s1"],
      // Queue of up to 30 calendar days counts from the application.
      deadline: { ...catalogDeadline("PMPK_ATTEND"), trigger_at: submittedB, due_at: "2026-10-21T18:59:59Z" },
    }),
    step("EDU_SUPPORT_REQUEST", { step_id: "s3", priority: "medium", status: "blocked", status_updated_at: approvedB, depends_on: ["s2"] }),
    step("EDU_REHAB_APPLY", { step_id: "s4", priority: "medium", status: "blocked", status_updated_at: approvedB, depends_on: ["s2"] }),
  ],
};

function catalogDeadline(actionId: string) {
  const definition = catalogV1.actions.find((action) => action.action_id === actionId);
  if (!definition) throw new Error(`Unknown action ${actionId}`);
  return definition.deadline;
}
