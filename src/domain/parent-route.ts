import { z } from "zod";
import { catalogV1 } from "./catalog/v1";
import { evaluate } from "./conditions";
import { questions, validAnswer, type Answers } from "@/lib/interview";
import { factsOf, noRouteInputs, type RouteInputs } from "./pmpk";

const priorities = ["high", "medium", "low"] as const;
export const selectionSchema = z.strictObject({
  selected_actions: z.array(z.strictObject({
    action_id: z.string(), priority: z.enum(priorities), rationale: z.string().min(20).max(600),
  })).min(1).max(11),
});

const diagnostic = /диагноз|аутизм|аутист|\bРАС\b|\bЗПР\b|умственн.{0,20}отстал|diagnos|autis/i;
const fictionalBooking = /заявка отправлена|вы записаны|запись подтверждена|свободн.{0,20}(слот|мест)|наш[её]л.{0,20}центр/i;

export function isInterviewComplete(answers: Answers): boolean {
  return questions.every(({ id }) => validAnswer(id, answers[id]));
}

// Never send the free-text residence, registration, email, name or raw nested input to OpenAI.
export function modelContext(answers: Answers, inputs: RouteInputs = noRouteInputs) {
  if (!isInterviewComplete(answers)) throw new Error("interview_incomplete");
  const age = Number(answers.AGE);
  return {
    age_band: age < 3 ? "0-2" : age < 7 ? "3-6" : age < 14 ? "7-13" : "14-17",
    completed_stages: answers.COMPLETED_STAGES,
    pmpk_status: answers.PMPK_STATUS,
    disability_status: answers.DISABILITY_STATUS,
    help_preference: answers.HELP_PREFERENCE,
    current_help: answers.CURRENT_HELP,
    current_services: answers.CURRENT_SERVICES,
    main_priority: answers.MAIN_PRIORITY,
    pmpk_conclusion_confirmed: inputs.pmpk_conclusion_confirmed,
    // Only the parent-confirmed recommendations, as enum codes: no dates, issuer or quotes.
    pmpk_recommendations: inputs.pmpk && {
      next_route: inputs.pmpk.next_route, specialists: inputs.pmpk.specialists, support_format: inputs.pmpk.support_format,
    },
  };
}

const factLabels: Record<string, string> = {
  pmpk_conclusion_confirmed: "Подтвердить наличие заключения ПМПК",
  mse_referral_confirmed: "Подтвердить наличие направления на МСЭ",
  home_schooling_vkk_confirmed: "Подтвердить заключение ВКК для обучения на дому",
  social_services_eligibility_confirmed: "Подтвердить право на социальные услуги",
};

// A parent-confirmed PMPK conclusion means the PMPK stage itself is done.
const pmpkStageActions = ["PMPK_APPLY", "PMPK_WAIT_APPOINTMENT", "PMPK_ATTEND"];
// Steps that need the conclusion to actually refer the child to KPPK, not just to exist.
const kppkActions = ["EDU_REHAB_APPLY"];
const kppkReferralLabel = "В подтверждённом заключении ПМПК нет направления в КППК";

export function allowedActions(answers: Answers, inputs: RouteInputs = noRouteInputs) {
  return catalogV1.actions.filter((action) =>
    evaluate(action.eligibility, { answers, facts: factsOf(inputs) })
    && !(inputs.pmpk_conclusion_confirmed && pmpkStageActions.includes(action.action_id))
    // The current interview cannot confirm these legal grounds. Do not invent them.
    && !action.prerequisites.facts.some((fact) => fact !== "pmpk_conclusion_confirmed"));
}

export type ParentRoute = {
  schema_version: "parent-route-1";
  catalog_version: string;
  generated_at: string;
  model: string;
  source: "openai";
  steps: {
    action_id: string; title: string; agency: string;
    priority: (typeof priorities)[number]; explanation: string; explanation_source: "ai" | "catalog_template";
    status: "ready" | "blocked"; depends_on: string[]; requirements: string[];
    documents: { document_id: string; title: string; required: boolean }[];
    deadline: (typeof catalogV1.actions)[number]["deadline"];
  }[];
};

function satisfiedOutsidePlan(actionId: string, answers: Answers): boolean {
  const pmpk = answers.PMPK_STATUS;
  if (actionId === "PMPK_APPLY") return pmpk === "in_progress" || pmpk === "yes";
  if (actionId === "PMPK_WAIT_APPOINTMENT" || actionId === "PMPK_ATTEND") return pmpk === "yes";
  return false;
}

// The server adds required actions and catalog fields; the model cannot invent services or dates.
export function assembleRoute(input: unknown, answers: Answers, model: string, now = new Date(), inputs: RouteInputs = noRouteInputs): ParentRoute {
  const selection = selectionSchema.parse(input);
  const facts = factsOf(inputs);
  const allowed = new Map(allowedActions(answers, inputs).map((action) => [action.action_id, action]));
  const selected = new Map<string, { priority: (typeof priorities)[number]; rationale: string; source: "ai" | "catalog_template" }>();
  for (const item of selection.selected_actions) {
    if (!allowed.has(item.action_id) || selected.has(item.action_id)) throw new Error("invalid_action");
    if (diagnostic.test(item.rationale) || fictionalBooking.test(item.rationale)) throw new Error("invalid_explanation");
    selected.set(item.action_id, { ...item, source: "ai" });
  }
  const addDependencies = (id: string) => {
    const action = allowed.get(id)!;
    for (const dependency of action.prerequisites.actions) {
      if (satisfiedOutsidePlan(dependency, answers)) continue;
      const definition = allowed.get(dependency);
      if (!definition) throw new Error("missing_prerequisite");
      if (!selected.has(dependency)) {
        selected.set(dependency, { priority: "high", rationale: definition.explanation_template, source: "catalog_template" });
        addDependencies(dependency);
      }
    }
  };
  for (const id of [...selected.keys()]) addDependencies(id);
  const ordered: string[] = [];
  const visit = (id: string) => {
    if (ordered.includes(id)) return;
    for (const dep of allowed.get(id)!.prerequisites.actions) if (selected.has(dep)) visit(dep);
    ordered.push(id);
  };
  for (const id of selected.keys()) visit(id);
  return {
    schema_version: "parent-route-1", catalog_version: catalogV1.catalog_version,
    generated_at: now.toISOString(), model, source: "openai",
    steps: ordered.map((id) => {
      const definition = allowed.get(id)!;
      const item = selected.get(id)!;
      const dependencies = definition.prerequisites.actions.filter((dep) => selected.has(dep));
      const requirements = definition.prerequisites.facts.filter((fact) => !facts[fact]).map((fact) => factLabels[fact]);
      if (inputs.pmpk && inputs.pmpk.next_route !== "KPPK" && kppkActions.includes(id)) requirements.push(kppkReferralLabel);
      return {
        action_id: id, title: definition.title, agency: definition.agency,
        priority: item.priority, explanation: item.rationale, explanation_source: item.source,
        status: dependencies.length || requirements.length ? "blocked" : "ready",
        depends_on: dependencies, requirements, documents: definition.documents, deadline: definition.deadline,
      };
    }),
  };
}

export function selectionJsonSchema(ids: string[]) {
  return {
    type: "object", additionalProperties: false, required: ["selected_actions"],
    properties: { selected_actions: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["action_id", "priority", "rationale"],
      properties: {
        action_id: { type: "string", enum: ids }, priority: { type: "string", enum: priorities }, rationale: { type: "string" },
      },
    } } },
  };
}
