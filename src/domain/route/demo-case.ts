import type { Center, ProgramItem, Service, Slot, Step } from "./route";

// Synthetic case C (@.archcore/alikhan-synthetic-case.scenario.md). All names and addresses are invented.

export const child = { name: "Алихан", ageYears: 6 };

export const initialSteps: Step[] = [
  { stage: "SPECIALIST_CONSULTATION", status: "NOT_STARTED", deadline: null },
  { stage: "PMPK", status: "IN_PROGRESS", deadline: null },
  { stage: "KPPK", status: "BLOCKED", deadline: null },
  { stage: "INDIVIDUAL_PROGRAM", status: "BLOCKED", deadline: null },
  { stage: "REHABILITATION", status: "BLOCKED", deadline: null },
  { stage: "CONTROL_ASSESSMENT", status: "BLOCKED", deadline: null },
];

// What the document intake returns for the anonymised PMPK conclusion (@.archcore/document-intake.spec.md).
export const pmpkParse = {
  type: "Заключение ПМПК",
  date: "23.04.2026",
  nextRoute: "Кабинет психолого-педагогической коррекции",
  format: "Индивидуальная развивающая программа",
  specialists: ["Дефектолог", "Логопед"],
  quote: "…специальная поддержка дефектологом и логопедом в условиях кабинета психолого-педагогической коррекции по индивидуальной развивающей программе…",
};

export const kppkCenters: Center[] = [
  { id: "kppk-1", name: "КППК №1", address: "ул. Сейфуллина, 12", distanceKm: 1.8, ownership: "public",
    services: ["defectolog", "logoped"], ages: [0, 18], paidCuratorAvailable: false },
  { id: "kppk-4", name: "КППК №4", address: "мкр. Самал-2, 7", distanceKm: 3.9, ownership: "public",
    services: ["defectolog", "logoped"], ages: [0, 18], paidCuratorAvailable: false },
];

export const kppkSlots = [
  { centerId: "kppk-1", startsAt: "2026-10-05T11:00" },
  { centerId: "kppk-4", startsAt: "2026-10-07T15:30" },
];

export const kppkNeededServices: Service[] = ["defectolog", "logoped"];

export const program = {
  author: "Специалист КППК №1",
  period: "05.10–05.01",
  items: [
    { service: "logoped", perWeek: 3 },
    { service: "defectolog", perWeek: 2 },
    { service: "psychologist", perWeek: 1 },
  ] satisfies ProgramItem[],
};

// Free specialist slots for the week of 12–17 October. Monday 10:00 psychologist clashes with the speech therapist.
export const weekSlots: Slot[] = [
  { id: "l-mon", service: "logoped", specialist: "Логопед Айгерим С.", startsAt: "2026-10-12T10:00" },
  { id: "p-mon", service: "psychologist", specialist: "Психолог Дана К.", startsAt: "2026-10-12T10:00" },
  { id: "d-tue", service: "defectolog", specialist: "Дефектолог Марат Е.", startsAt: "2026-10-13T11:00" },
  { id: "l-wed", service: "logoped", specialist: "Логопед Айгерим С.", startsAt: "2026-10-14T10:00" },
  { id: "p-wed", service: "psychologist", specialist: "Психолог Дана К.", startsAt: "2026-10-14T14:00" },
  { id: "d-thu", service: "defectolog", specialist: "Дефектолог Марат Е.", startsAt: "2026-10-15T11:00" },
  { id: "l-fri", service: "logoped", specialist: "Логопед Айгерим С.", startsAt: "2026-10-16T10:00" },
  { id: "l-sat", service: "logoped", specialist: "Логопед Айгерим С.", startsAt: "2026-10-17T10:00" },
];

export const weekEnd = "2026-10-18T23:59";
export const missedSlotId = "l-fri";
export const nextAssessment = "05.01.2027";
