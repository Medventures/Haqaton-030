import { describe, expect, it } from "vitest";
import { demoRouteState } from "./demo-status";

describe("demo route from interview and confirmed actions", () => {
  it("shows no route or progress while the interview is a draft", () => {
    expect(demoRouteState("upload", { COMPLETED_STAGES: ["specialists"] }, false))
      .toEqual({ steps: [], current: null, percent: 0 });
  });

  it("does not mark a consultation complete from a questionnaire answer", () => {
    const empty = demoRouteState("upload", { COMPLETED_STAGES: ["none"] }, true);
    const reported = demoRouteState("upload", { COMPLETED_STAGES: ["specialists"] }, true);
    expect(empty.steps[0].status).toBe("NOT_STARTED");
    expect(reported.steps[0].status).toBe("IN_PROGRESS");
    expect(empty.percent).toBe(0);
    expect(reported.percent).toBe(0);
    expect(reported.current).toBe("PMPK");
  });

  it("counts the confirmed PMPK result but keeps the unverified consultation open", () => {
    const route = demoRouteState("centers", { COMPLETED_STAGES: ["specialists"] }, true);
    expect(route.steps.find((step) => step.stage === "PMPK")?.status).toBe("COMPLETED");
    expect(route.steps.find((step) => step.stage === "SPECIALIST_CONSULTATION")?.status).toBe("IN_PROGRESS");
    expect(route.current).toBe("KPPK");
    expect(route.percent).toBe(17);
  });
});
