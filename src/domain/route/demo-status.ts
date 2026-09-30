import { validAnswer, type Answers } from "@/lib/interview";
import { initialSteps } from "./demo-case";
import { progress, type StageId, type Step, type StepStatus } from "./route";

export const DEMO_PHASES = ["upload", "parsed", "searching", "centers", "booking-check", "booked", "program", "schedule", "scheduled", "control", "rescheduled"] as const;
export type DemoPhase = (typeof DEMO_PHASES)[number];
export const afterPhase = (phase: DemoPhase, than: DemoPhase) => DEMO_PHASES.indexOf(phase) >= DEMO_PHASES.indexOf(than);

export function demoRouteState(phase: DemoPhase, answers: Answers, interviewCompleted: boolean) {
  if (!interviewCompleted) return { steps: [] as Step[], current: null as StageId | null, percent: 0 };

  const reported = validAnswer("COMPLETED_STAGES", answers.COMPLETED_STAGES)
    ? answers.COMPLETED_STAGES as string[] : [];
  const status: Partial<Record<StageId, StepStatus>> = {
    SPECIALIST_CONSULTATION: reported.includes("specialists") ? "IN_PROGRESS" : "NOT_STARTED",
  };
  if (afterPhase(phase, "searching")) Object.assign(status, { PMPK: "COMPLETED", KPPK: "NOT_STARTED" });
  if (afterPhase(phase, "booked")) status.KPPK = "IN_PROGRESS";
  if (afterPhase(phase, "program")) Object.assign(status, { KPPK: "COMPLETED", INDIVIDUAL_PROGRAM: "COMPLETED", REHABILITATION: "NOT_STARTED" });
  if (afterPhase(phase, "scheduled")) Object.assign(status, { REHABILITATION: "IN_PROGRESS", CONTROL_ASSESSMENT: "NOT_STARTED" });

  const steps = initialSteps.map((step) => ({ ...step, status: status[step.stage] ?? step.status }));
  const current: StageId = !afterPhase(phase, "searching") ? "PMPK"
    : !afterPhase(phase, "program") ? "KPPK" : "REHABILITATION";
  return { steps, current, percent: progress(steps) };
}
