// Case Plan v2 route logic (@.archcore/child-route.spec.md, @.archcore/center-matching-booking.spec.md,
// @.archcore/individual-program.spec.md). Times are local Asia/Almaty strings "YYYY-MM-DDTHH:mm".

export const STAGES = [
  { id: "SPECIALIST_CONSULTATION", title: "Консультация специалиста" },
  { id: "PMPK", title: "ПМПК" },
  { id: "KPPK", title: "Кабинет психолого-педагогической коррекции" },
  { id: "INDIVIDUAL_PROGRAM", title: "Индивидуальная программа" },
  { id: "REHABILITATION", title: "Реабилитация" },
  { id: "CONTROL_ASSESSMENT", title: "Контрольная оценка" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export type StepStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DECLINED_BY_PARENT" | "BLOCKED" | "OVERDUE";
export type Step = { stage: StageId; status: StepStatus; deadline: string | null };

const CLOSED: StepStatus[] = ["COMPLETED", "DECLINED_BY_PARENT"];

// Spec clause 4: share of COMPLETED among stages the family did not decline.
export function progress(steps: Step[]) {
  const counted = steps.filter((step) => step.status !== "DECLINED_BY_PARENT");
  if (counted.length === 0) return 100;
  return Math.round((counted.filter((step) => step.status === "COMPLETED").length / counted.length) * 100);
}

export function currentStage(steps: Step[]) {
  return steps.find((step) => !CLOSED.includes(step.status))?.stage ?? null;
}

// Spec clauses 7 and 12: a declined or completed step never becomes overdue.
export function withOverdue(step: Step, now: string): Step {
  if (CLOSED.includes(step.status) || !step.deadline || step.deadline >= now) return step;
  return { ...step, status: "OVERDUE" };
}

export type Service = "logoped" | "defectolog" | "psychologist" | "aac";
export const SERVICE_TITLES: Record<Service, string> = {
  logoped: "Логопед", defectolog: "Дефектолог", psychologist: "Психолог", aac: "AAC",
};

export type Center = {
  id: string;
  name: string;
  address: string;
  distanceKm: number;
  ownership: "public" | "private";
  services: Service[];
  ages: readonly [number, number];
  paidCuratorAvailable: boolean;
};

export type RouteChoice = { routeType: "public" | "paid"; paidCurator: boolean; ageYears: number };

export function matchCenters(centers: Center[], needed: Service[], choice: RouteChoice) {
  return centers
    .filter((center) => center.ownership === (choice.routeType === "public" ? "public" : "private"))
    .filter((center) => !(choice.routeType === "paid" && choice.paidCurator) || center.paidCuratorAvailable)
    .filter((center) => choice.ageYears >= center.ages[0] && choice.ageYears <= center.ages[1])
    .map((center) => ({ center, covered: needed.filter((service) => center.services.includes(service)), total: needed.length }))
    .filter((match) => match.covered.length > 0)
    .sort((a, b) => b.covered.length - a.covered.length || a.center.distanceKm - b.center.distanceKm);
}

export type CenterSlot = { centerId: string; startsAt: string };

export function matchKppkOptions(centers: Center[], slots: CenterSlot[], needed: Service[], choice: RouteChoice) {
  return matchCenters(centers, needed, choice).map((match) => ({
    ...match,
    slot: slots.filter((slot) => slot.centerId === match.center.id)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null,
  }));
}

export function createSyntheticKppkBooking(
  centers: Center[], slots: CenterSlot[], needed: Service[], choice: RouteChoice, proposed: CenterSlot | null,
) {
  if (!proposed) return null;
  const available = matchKppkOptions(centers, slots, needed, choice)
    .find((option) => option.center.id === proposed.centerId)?.slot;
  if (!available || available.startsAt !== proposed.startsAt) return null;
  return { ...proposed, status: "BOOKED" as const };
}

export type Slot = { id: string; service: Service; specialist: string; startsAt: string };
export type AppointmentStatus = "BOOKED" | "ATTENDED" | "MISSED" | "CANCELLED";
export type Appointment = Slot & { status: AppointmentStatus };
export type ProgramItem = { service: Service; perWeek: number };

const SESSION_MINUTES = 45;
const minutes = (at: string) => Date.parse(`${at}:00Z`) / 60_000;
const overlaps = (a: string, b: string) => Math.abs(minutes(a) - minutes(b)) < SESSION_MINUTES;

// Spec individual-program clauses 3-4: earliest free slots per service, never two sessions at once.
export function buildSchedule(program: ProgramItem[], slots: Slot[]) {
  const booked: Slot[] = [];
  const unplaced: { service: Service; missing: number }[] = [];
  for (const item of program) {
    const picked = slots
      .filter((slot) => slot.service === item.service)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .reduce<Slot[]>((acc, slot) => acc.length < item.perWeek && ![...booked, ...acc].some((b) => overlaps(b.startsAt, slot.startsAt)) ? [...acc, slot] : acc, []);
    booked.push(...picked);
    if (picked.length < item.perWeek) unplaced.push({ service: item.service, missing: item.perWeek - picked.length });
  }
  return { appointments: booked.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((slot): Appointment => ({ ...slot, status: "BOOKED" })), unplaced };
}

export function weekStats(program: ProgramItem[], appointments: Appointment[]) {
  return program.map((item) => {
    const own = appointments.filter((a) => a.service === item.service);
    return {
      service: item.service,
      planned: item.perWeek,
      attended: own.filter((a) => a.status === "ATTENDED").length,
      missed: own.filter((a) => a.status === "MISSED").length,
      upcoming: own.filter((a) => a.status === "BOOKED").length,
    };
  });
}

// Spec individual-program clause 10: a free slot of the same service later in the same week.
export function findReschedule(missed: Appointment, slots: Slot[], appointments: Appointment[], weekEnd: string) {
  const busy = appointments.filter((a) => a.status !== "CANCELLED" && a.status !== "MISSED");
  return slots
    .filter((slot) => slot.service === missed.service && slot.startsAt > missed.startsAt && slot.startsAt <= weekEnd)
    .filter((slot) => !busy.some((a) => a.id === slot.id || overlaps(a.startsAt, slot.startsAt)))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
}
