import { describe, expect, it } from "vitest";

import { missedSlotId, program, weekEnd, weekSlots } from "./demo-case";
import { buildSchedule, createSyntheticKppkBooking, findReschedule, matchCenters, matchKppkOptions, progress, withOverdue, weekStats, type Center, type Step } from "./route";
import { kppkCenters, kppkNeededServices, kppkSlots } from "./demo-case";

describe("progress and overdue", () => {
  it("counts COMPLETED among stages the family did not decline", () => {
    const steps: Step[] = [
      { stage: "SPECIALIST_CONSULTATION", status: "COMPLETED", deadline: null },
      { stage: "PMPK", status: "DECLINED_BY_PARENT", deadline: null },
      { stage: "KPPK", status: "IN_PROGRESS", deadline: null },
    ];
    expect(progress(steps)).toBe(50);
  });

  it("never marks a declined or completed step overdue", () => {
    const past = "2026-09-01T00:00";
    expect(withOverdue({ stage: "PMPK", status: "DECLINED_BY_PARENT", deadline: past }, "2026-10-01T00:00").status).toBe("DECLINED_BY_PARENT");
    expect(withOverdue({ stage: "PMPK", status: "COMPLETED", deadline: past }, "2026-10-01T00:00").status).toBe("COMPLETED");
    expect(withOverdue({ stage: "PMPK", status: "IN_PROGRESS", deadline: past }, "2026-10-01T00:00").status).toBe("OVERDUE");
  });
});

describe("matchCenters", () => {
  const base = { address: "", ownership: "private", ages: [0, 18] } as const;
  const centers: Center[] = [
    { ...base, id: "b", name: "Центр B", distanceKm: 2.2, services: ["logoped", "defectolog", "psychologist"], paidCuratorAvailable: false },
    { ...base, id: "a", name: "Центр A", distanceKm: 1.8, services: ["logoped", "defectolog", "psychologist", "aac"], paidCuratorAvailable: true },
  ];
  const needed = ["logoped", "defectolog", "psychologist", "aac"] as const;

  it("sorts by coverage and shows N of M", () => {
    const result = matchCenters(centers, [...needed], { routeType: "paid", paidCurator: false, ageYears: 6 });
    expect(result.map((m) => `${m.center.name} ${m.covered.length}/${m.total}`)).toEqual(["Центр A 4/4", "Центр B 3/4"]);
  });

  it("keeps only centers with a paid curator when the family wants one", () => {
    const result = matchCenters(centers, [...needed], { routeType: "paid", paidCurator: true, ageYears: 6 });
    expect(result.map((m) => m.center.id)).toEqual(["a"]);
  });
});

describe("matchKppkOptions", () => {
  const choice = { routeType: "public" as const, paidCurator: false, ageYears: 6 };

  it("recommends КППК №1 and keeps КППК №4 available", () => {
    const options = matchKppkOptions(kppkCenters, kppkSlots, kppkNeededServices, choice);
    expect(options.map((option) => [option.center.id, option.covered.length, option.slot?.startsAt])).toEqual([
      ["kppk-1", 2, "2026-10-05T11:00"],
      ["kppk-4", 2, "2026-10-07T15:30"],
    ]);
  });

  it("returns no options if no organization matches and no slot if none is listed", () => {
    expect(matchKppkOptions([], kppkSlots, kppkNeededServices, choice)).toEqual([]);
    const options = matchKppkOptions(kppkCenters, [], kppkNeededServices, choice);
    expect(options.every((option) => option.slot === null)).toBe(true);
  });

  it("books only the exact proposed time after it is checked again", () => {
    const proposed = kppkSlots[0];
    expect(createSyntheticKppkBooking(kppkCenters, kppkSlots, kppkNeededServices, choice, proposed))
      .toEqual({ ...proposed, status: "BOOKED" });
    expect(createSyntheticKppkBooking(kppkCenters, [], kppkNeededServices, choice, proposed)).toBeNull();
    expect(createSyntheticKppkBooking(kppkCenters,
      [{ ...proposed, startsAt: "2026-10-05T12:00" }], kppkNeededServices, choice, proposed)).toBeNull();
  });
});

describe("schedule and control", () => {
  it("places 3/2/1 sessions without overlaps", () => {
    const { appointments, unplaced } = buildSchedule(program.items, weekSlots);
    expect(unplaced).toEqual([]);
    expect(appointments.map((a) => a.id)).toEqual(["l-mon", "d-tue", "l-wed", "p-wed", "d-thu", "l-fri"]);
  });

  it("reports sessions that do not fit", () => {
    const { unplaced } = buildSchedule([{ service: "psychologist", perWeek: 3 }], weekSlots);
    expect(unplaced).toEqual([{ service: "psychologist", missing: 1 }]);
  });

  it("counts a missed session and rebooks it on Saturday", () => {
    const booked = buildSchedule(program.items, weekSlots).appointments
      .map((a) => ({ ...a, status: a.id === missedSlotId ? "MISSED" as const : "ATTENDED" as const }));
    expect(weekStats(program.items, booked)[0]).toMatchObject({ service: "logoped", attended: 2, missed: 1 });
    const missed = booked.find((a) => a.id === missedSlotId)!;
    expect(findReschedule(missed, weekSlots, booked, weekEnd)?.startsAt).toBe("2026-10-17T10:00");
  });
});
