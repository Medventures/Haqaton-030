export const services = [
  { id: "specialist_consultation", label: "Консультация специалиста" },
  { id: "pmpk_assessment", label: "Обследование ПМПК" },
  { id: "disability_registration", label: "Оформление инвалидности" },
  { id: "rehabilitation", label: "Реабилитация" },
  { id: "early_intervention", label: "Ранняя помощь" },
  { id: "education_support", label: "Поддержка в образовании" },
] as const;

export const questions = [
  { id: "AGE", title: "Сколько лет ребёнку?", reason: "Определяет возрастную ветку: до 3 лет / 3–14 / 14–18." },
  { id: "RESIDENCE", title: "Где ребёнок фактически проживает?", reason: "Помогает искать доступные службы и ближайшие центры." },
  { id: "REGISTRATION", title: "Где ребёнок зарегистрирован по месту жительства?", reason: "Нужно для услуг, привязанных к территории, прежде всего ПМПК." },
  { id: "COMPLETED_STAGES", title: "Какие этапы вы уже проходили?", reason: "Помогает не проходить уже завершённые этапы повторно." },
  { id: "PMPK_STATUS", title: "Есть ли действующее заключение ПМПК?", reason: "Помогает учесть уже пройденную ПМПК или добавить этот шаг." },
  { id: "DISABILITY_STATUS", title: "Оформлена ли ребёнку инвалидность?", reason: "Определяет возможную социальную ветку маршрута." },
  { id: "HELP_PREFERENCE", title: "Какой вариант помощи вы рассматриваете?", reason: "Помогает подобрать государственный, частный или смешанный маршрут." },
  { id: "CURRENT_HELP", title: "Получает ли ребёнок сейчас помощь или реабилитацию?", reason: "Показывает, есть ли уже действующий маршрут." },
  { id: "CURRENT_SERVICES", title: "Какие услуги ребёнок уже получает сейчас?", reason: "Помогает не дублировать действующие услуги." },
  { id: "MAIN_PRIORITY", title: "Что вам сейчас важнее всего?", reason: "Помогает расставить приоритеты и объяснить маршрут." },
] as const;

export type QuestionId = (typeof questions)[number]["id"];
export type Answers = Partial<Record<QuestionId, unknown>>;

export const demoAnswers: Answers = {
  AGE: 2,
  RESIDENCE: { city: "Алматы", district: "Бостандыкский район" },
  REGISTRATION: { same: true },
  COMPLETED_STAGES: ["none"],
  PMPK_STATUS: "no",
  DISABILITY_STATUS: "no",
  HELP_PREFERENCE: "state",
  CURRENT_HELP: "none",
};

const completedStages = ["specialists", "pmpk", "disability", "rehabilitation", "none"];
const pmpkStatuses = ["yes", "no", "in_progress", "unknown"];
const disabilityStatuses = ["yes", "no", "in_progress", "not_planned"];
const helpPreferences = ["state", "private", "both", "unknown"];
const currentHelp = ["none", "state", "private", "other"];
const priorities = ["start", "documents", "pmpk", "center", "services", "continue", "check"];
const serviceIds: string[] = services.map((service) => service.id);

function place(value: unknown): value is { city: string; district: string } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.city === "string" && item.city.trim().length > 0 && item.city.length <= 80
    && typeof item.district === "string" && item.district.trim().length > 0 && item.district.length <= 80;
}

function listed(value: unknown, options: string[]) {
  return typeof value === "string" && options.includes(value);
}

function multi(value: unknown, options: string[]) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => listed(item, options))
    && new Set(value).size === value.length;
}

export function validAnswer(id: QuestionId, value: unknown): boolean {
  switch (id) {
    case "AGE": return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 18;
    case "RESIDENCE": return place(value);
    case "REGISTRATION": {
      if (!value || typeof value !== "object") return false;
      const item = value as Record<string, unknown>;
      return item.same === true || (item.same === false && place(item.place));
    }
    case "COMPLETED_STAGES": return multi(value, completedStages) && (!(value as string[]).includes("none") || (value as string[]).length === 1);
    case "PMPK_STATUS": return listed(value, pmpkStatuses);
    case "DISABILITY_STATUS": return listed(value, disabilityStatuses);
    case "HELP_PREFERENCE": return listed(value, helpPreferences);
    case "CURRENT_HELP": return listed(value, currentHelp);
    case "CURRENT_SERVICES": return value === "none" || multi(value, serviceIds);
    case "MAIN_PRIORITY": return listed(value, priorities);
  }
}
