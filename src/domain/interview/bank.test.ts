import { describe, expect, it } from "vitest";

import { caseAAnswers, caseBAnswers } from "../fixtures/cases";
import { applicableQuestions, MAX_QUESTIONS, MIN_QUESTIONS, questionBank, validBankAnswer, type BankQuestionId } from "./bank";

// Every answer value that a condition in the bank looks at.
const branches = {
  AGE: [0, 2, 3, 7, 17],
  CURRENT_HELP: ["none", "state", "private", "other"],
  PMPK_STATUS: ["yes", "no", "in_progress", "unknown"],
};

describe("question bank v1", () => {
  it("asks 8–12 questions on every branch", () => {
    for (const AGE of branches.AGE) for (const CURRENT_HELP of branches.CURRENT_HELP) for (const PMPK_STATUS of branches.PMPK_STATUS) {
      const count = applicableQuestions({ AGE, CURRENT_HELP, PMPK_STATUS }).length;
      expect(count, JSON.stringify({ AGE, CURRENT_HELP, PMPK_STATUS })).toBeGreaterThanOrEqual(MIN_QUESTIONS);
      expect(count).toBeLessThanOrEqual(MAX_QUESTIONS);
    }
  });

  it("conditions only look at questions asked earlier", () => {
    questionBank.forEach((question, index) => {
      const referenced = JSON.stringify(question.appliesWhen ?? {}).match(/"answer":"([A-Z_]+)"/g) ?? [];
      for (const match of referenced) {
        const id = match.split('"')[3];
        expect(questionBank.findIndex((item) => item.id === id), `${question.id} uses ${id}`).toBeLessThan(index);
      }
    });
  });

  it("has unique ids", () => {
    expect(new Set(questionBank.map((question) => question.id)).size).toBe(questionBank.length);
  });

  it("asks about the PMPK application only when it is in progress", () => {
    const ids = (answers: Record<string, unknown>) => applicableQuestions(answers).map((question) => question.id);
    expect(ids({ PMPK_STATUS: "yes" })).not.toContain("PMPK_APPLICATION");
    expect(ids({ PMPK_STATUS: "in_progress" })).toContain("PMPK_APPLICATION");
  });

  it.each([["A", caseAAnswers, 9], ["B", caseBAnswers, 11]] as const)("case %s answers every applicable question validly", (_, answers, count) => {
    const applicable = applicableQuestions(answers);
    expect(applicable).toHaveLength(count);
    for (const { id } of applicable) expect(validBankAnswer(id, (answers as Record<string, unknown>)[id]), id).toBe(true);
  });

  it("rejects malformed follow-up answers", () => {
    const bad: [BankQuestionId, unknown][] = [
      ["EDUCATION_STAGE", "university"],
      ["PMPK_APPLICATION", { submitted_on: "21.09.2026", channel: "portal", appointment: "assigned" }],
      ["PMPK_APPLICATION", { submitted_on: "2026-09-21", channel: "email", appointment: "assigned" }],
    ];
    for (const [id, value] of bad) expect(validBankAnswer(id, value)).toBe(false);
  });
});
