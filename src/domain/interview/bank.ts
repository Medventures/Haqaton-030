import { questions as baseQuestions, validAnswer as validBaseAnswer, type QuestionId as BaseQuestionId } from "@/lib/interview";

import { evaluate, type Condition } from "../conditions";

// Question bank v1: the ten accepted questions (@.archcore/parent-interview-question-bank.doc.md)
// plus conditional follow-ups. Any branch yields 9–12 questions, inside the KMU range 8–12.

export const QUESTION_BANK_VERSION = "2026-09-30.1";
export const MIN_QUESTIONS = 8;
export const MAX_QUESTIONS = 12;

export type BankQuestionId = BaseQuestionId | "EDUCATION_STAGE" | "PMPK_APPLICATION";

export type BankQuestion = {
  id: BankQuestionId;
  title: string;
  reason: string;
  // No condition: asked in every session.
  appliesWhen?: Condition;
};

const extra: Record<"EDUCATION_STAGE" | "PMPK_APPLICATION", BankQuestion> = {
  EDUCATION_STAGE: {
    id: "EDUCATION_STAGE",
    title: "Посещает ли ребёнок детский сад или школу?",
    reason: "Показывает, куда передавать рекомендации по поддержке в образовании.",
    appliesWhen: { answer: "AGE", min: 3 },
  },
  PMPK_APPLICATION: {
    id: "PMPK_APPLICATION",
    title: "Когда и как подано заявление в ПМПК? Назначена ли дата обследования?",
    reason: "От даты и способа подачи зависит срок назначения обследования.",
    appliesWhen: { answer: "PMPK_STATUS", in: ["in_progress"] },
  },
};

const conditions: Partial<Record<BaseQuestionId, Condition>> = {
  CURRENT_SERVICES: { not: { answer: "CURRENT_HELP", in: ["none"] } },
};

// Bank order is also the deterministic fallback order when the model is unavailable.
export const questionBank: BankQuestion[] = baseQuestions.flatMap((question): BankQuestion[] => {
  const item: BankQuestion = { id: question.id, title: question.title, reason: question.reason, appliesWhen: conditions[question.id] };
  if (question.id === "REGISTRATION") return [item, extra.EDUCATION_STAGE];
  if (question.id === "PMPK_STATUS") return [item, extra.PMPK_APPLICATION];
  return [item];
});

export const educationStages = ["none", "kindergarten", "school"] as const;
export type EducationStage = (typeof educationStages)[number];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function validBankAnswer(id: BankQuestionId, value: unknown): boolean {
  if (id === "EDUCATION_STAGE") return typeof value === "string" && (educationStages as readonly string[]).includes(value);
  if (id === "PMPK_APPLICATION") {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return typeof item.submitted_on === "string" && isoDate.test(item.submitted_on)
      && !Number.isNaN(Date.parse(`${item.submitted_on}T00:00:00Z`))
      && (item.channel === "portal" || item.channel === "office")
      && (item.appointment === "assigned" || item.appointment === "not_assigned");
  }
  return validBaseAnswer(id, value);
}

// Questions that apply given the answers so far. Conditions only look at earlier answers.
export function applicableQuestions(answers: Record<string, unknown>): BankQuestion[] {
  return questionBank.filter((question) => !question.appliesWhen || evaluate(question.appliesWhen, { answers, facts: {} }));
}
