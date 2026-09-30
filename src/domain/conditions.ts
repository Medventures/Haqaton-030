// Declarative conditions shared by the question bank and the service catalog.
// Data, not code: they are stored in service_catalog.definition_json and checked by tests.

export const FACT_IDS = [
  "pmpk_conclusion_confirmed",
  "mse_referral_confirmed",
  "home_schooling_vkk_confirmed",
  "social_services_eligibility_confirmed",
] as const;
export type FactId = (typeof FACT_IDS)[number];

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { answer: string; in: readonly string[] }
  | { answer: string; includesAny: readonly string[] }
  | { answer: string; min?: number; max?: number }
  | { answer: string; field: string; in: readonly string[] }
  | { fact: FactId };

export type ConditionInput = {
  answers: Record<string, unknown>;
  facts: Partial<Record<FactId, boolean>>;
};

export function evaluate(condition: Condition, input: ConditionInput): boolean {
  if ("all" in condition) return condition.all.every((item) => evaluate(item, input));
  if ("any" in condition) return condition.any.some((item) => evaluate(item, input));
  if ("not" in condition) return !evaluate(condition.not, input);
  if ("fact" in condition) return input.facts[condition.fact] === true;

  const value = input.answers[condition.answer];
  if ("field" in condition) {
    const nested = value && typeof value === "object" ? (value as Record<string, unknown>)[condition.field] : undefined;
    return typeof nested === "string" && condition.in.includes(nested);
  }
  if ("in" in condition) return typeof value === "string" && condition.in.includes(value);
  if ("includesAny" in condition) {
    return Array.isArray(value) && value.some((item) => condition.includesAny.includes(item));
  }
  if (typeof value !== "number") return false;
  return (condition.min === undefined || value >= condition.min)
    && (condition.max === undefined || value <= condition.max);
}
