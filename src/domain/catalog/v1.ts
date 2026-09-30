import type { DeadlineSource, ServiceCatalog } from "./types";

// Published catalog versions are immutable: change a definition by adding a new version.

const ORDER_223_URL = "https://adilet.zan.kz/rus/docs/V2000020744";
const order223 = (clause: string): DeadlineSource => ({
  title: "Приказ Министра образования и науки РК от 27.05.2020 № 223",
  url: ORDER_223_URL,
  clause,
});
const internal = (note: string): DeadlineSource => ({ title: "Внутренний ориентир AqylRoute", url: null, clause: note });

const childId = {
  document_id: "child_identity",
  title: "Документ, удостоверяющий личность ребёнка, или цифровой документ",
  required: true,
};
const pmpkConclusion = { document_id: "pmpk_conclusion", title: "Заключение ПМПК", required: true };
const parentApplication = { document_id: "parent_application", title: "Заявление родителя в произвольной форме", required: true };

export const catalogV1: ServiceCatalog = {
  catalog_version: "2026-09-30.1",
  effective_from: "2026-09-30",
  actions: [
    {
      action_id: "MED_PHC_DEV_REVIEW",
      title: "Обратиться в поликлинику по вопросу развития ребёнка",
      agency: "Организация ПМСП по месту прикрепления",
      responsible: { role: "parent", label: "Родитель" },
      documents: [childId],
      eligibility: {
        all: [
          { not: { answer: "COMPLETED_STAGES", includesAny: ["specialists"] } },
          { answer: "CURRENT_HELP", in: ["none"] },
        ],
      },
      prerequisites: { actions: [], facts: [] },
      provides_facts: [],
      deadline: {
        kind: "internal_target", trigger: "plan_approved",
        duration: { amount: 3, unit: "calendar_days" }, source: internal("Не государственный срок"),
      },
      parent_can_complete: true,
      explanation_template: "Поликлиника по месту прикрепления — первая точка маршрута: специалисты посмотрят, какая помощь нужна ребёнку сейчас, и подскажут следующие шаги.",
    },
    {
      action_id: "PMPK_APPLY",
      title: "Подать заявление в ПМПК",
      agency: "ПМПК по месту регистрации ребёнка",
      responsible: { role: "parent", label: "Родитель" },
      documents: [
        childId,
        { document_id: "disability_conclusion", title: "Заключение об инвалидности (при наличии)", required: false },
        { document_id: "vkk_home_schooling", title: "Заключение ВКК о необходимости обучения на дому (при наличии)", required: false },
      ],
      eligibility: { answer: "PMPK_STATUS", in: ["no", "unknown"] },
      prerequisites: { actions: [], facts: [] },
      provides_facts: [],
      deadline: {
        kind: "internal_target", trigger: "plan_approved",
        duration: { amount: 7, unit: "calendar_days" }, source: internal("Не государственный срок"),
      },
      parent_can_complete: true,
      explanation_template: "Заключение ПМПК определяет, какая поддержка в образовании доступна ребёнку. Заявление удобно подать через портал egov.kz.",
    },
    {
      action_id: "PMPK_WAIT_APPOINTMENT",
      title: "Получить дату обследования ПМПК",
      agency: "ПМПК по месту регистрации ребёнка",
      responsible: { role: "agency", label: "ПМПК" },
      documents: [],
      eligibility: {
        any: [
          { answer: "PMPK_STATUS", in: ["no", "unknown"] },
          {
            all: [
              { answer: "PMPK_STATUS", in: ["in_progress"] },
              { answer: "PMPK_APPLICATION", field: "channel", in: ["portal"] },
              { answer: "PMPK_APPLICATION", field: "appointment", in: ["not_assigned"] },
            ],
          },
        ],
      },
      prerequisites: { actions: ["PMPK_APPLY"], facts: [] },
      provides_facts: [],
      deadline: {
        kind: "statutory", trigger: "pmpk_application_submitted",
        duration: { amount: 2, unit: "working_days" },
        source: order223("Стандарт услуги «Обследование и оказание психолого-медико-педагогической консультативной помощи детям с ограниченными возможностями», п. 4: при обращении через портал"),
      },
      parent_can_complete: true,
      explanation_template: "После подачи заявления через портал ПМПК назначает дату обследования. Если дата не пришла в срок, куратор увидит это и поможет.",
    },
    {
      action_id: "PMPK_ATTEND",
      title: "Пройти обследование ПМПК",
      agency: "ПМПК по месту регистрации ребёнка",
      responsible: { role: "parent", label: "Родитель" },
      documents: [
        childId,
        { document_id: "disability_conclusion", title: "Заключение об инвалидности (при наличии)", required: false },
        { document_id: "outpatient_card_052u", title: "Медицинская карта амбулаторного пациента, форма № 052/у (по запросу ПМПК)", required: false },
        { document_id: "education_profile", title: "Психолого-педагогическая характеристика из организации образования (по запросу ПМПК)", required: false },
      ],
      eligibility: { answer: "PMPK_STATUS", in: ["no", "unknown", "in_progress"] },
      prerequisites: { actions: ["PMPK_WAIT_APPOINTMENT"], facts: [] },
      provides_facts: ["pmpk_conclusion_confirmed"],
      deadline: {
        kind: "statutory", trigger: "pmpk_application_submitted",
        duration: { amount: 30, unit: "calendar_days" },
        source: order223("Там же, п. 4: время ожидания в очереди на обследование — до 30 календарных дней; отсчёт от подачи заявления — толкование AqylRoute"),
      },
      parent_can_complete: false,
      explanation_template: "На обследовании специалисты ПМПК дают рекомендации по обучению и поддержке. Результат куратор отметит в маршруте.",
    },
    {
      action_id: "EDU_SUPPORT_REQUEST",
      title: "Передать рекомендации ПМПК в детский сад или школу",
      agency: "Организация образования, которую посещает ребёнок",
      responsible: { role: "parent", label: "Родитель" },
      documents: [pmpkConclusion],
      eligibility: { answer: "EDUCATION_STAGE", in: ["kindergarten", "school"] },
      prerequisites: { actions: [], facts: ["pmpk_conclusion_confirmed"] },
      provides_facts: [],
      deadline: {
        kind: "internal_target", trigger: "pmpk_conclusion_confirmed",
        duration: { amount: 10, unit: "calendar_days" }, source: internal("Не государственный срок"),
      },
      parent_can_complete: true,
      explanation_template: "С рекомендациями ПМПК детский сад или школа могут организовать поддержку ребёнка в учёбе.",
    },
    {
      action_id: "EDU_REHAB_APPLY",
      title: "Подать документы на психолого-педагогическую поддержку",
      agency: "Кабинет психолого-педагогической коррекции или реабилитационный центр",
      responsible: { role: "parent", label: "Родитель" },
      documents: [parentApplication, pmpkConclusion],
      eligibility: { not: { answer: "CURRENT_SERVICES", includesAny: ["rehabilitation"] } },
      prerequisites: { actions: [], facts: ["pmpk_conclusion_confirmed"] },
      provides_facts: [],
      deadline: {
        kind: "internal_target", trigger: "pmpk_conclusion_confirmed",
        duration: { amount: 14, unit: "calendar_days" }, source: internal("Не государственный срок"),
      },
      parent_can_complete: false,
      explanation_template: "С заключением ПМПК можно получить бесплатные занятия со специалистами в кабинете коррекции или реабилитационном центре.",
    },
    {
      action_id: "EDU_REHAB_COURSE",
      title: "Проходить курс психолого-педагогической поддержки",
      agency: "Кабинет психолого-педагогической коррекции или реабилитационный центр",
      responsible: { role: "agency", label: "Организация, принявшая документы" },
      documents: [],
      eligibility: { not: { answer: "CURRENT_SERVICES", includesAny: ["rehabilitation"] } },
      prerequisites: { actions: ["EDU_REHAB_APPLY"], facts: [] },
      provides_facts: [],
      deadline: {
        kind: "service_duration", trigger: "prerequisite_completed",
        duration: { min_days: 90, max_days: 365 },
        source: order223("Стандарт услуги «Реабилитация и социальная адаптация детей и подростков с проблемами в развитии», п. 4"),
      },
      parent_can_complete: false,
      explanation_template: "Курс поддержки длится от 90 до 365 дней. Куратор отмечает начало и завершение курса.",
    },
    {
      action_id: "HOME_SCHOOLING_APPLY",
      title: "Подать заявление на обучение на дому",
      agency: "Отдел образования по месту жительства",
      responsible: { role: "parent", label: "Родитель" },
      documents: [
        parentApplication,
        { document_id: "vkk_home_schooling", title: "Заключение ВКК с рекомендацией обучения на дому", required: true },
      ],
      eligibility: { answer: "EDUCATION_STAGE", in: ["school"] },
      prerequisites: { actions: [], facts: ["home_schooling_vkk_confirmed"] },
      provides_facts: [],
      deadline: {
        kind: "statutory", trigger: "self_submitted",
        duration: { amount: 2, unit: "working_days" },
        source: order223("Стандарт услуги «Прием документов для организации индивидуального бесплатного обучения на дому…», п. 4"),
      },
      parent_can_complete: false,
      explanation_template: "Если врачебная комиссия рекомендовала обучение на дому, отдел образования принимает заявление и организует занятия.",
    },
    {
      action_id: "MSE_PREPARE",
      title: "Проверить готовность документов к МСЭ",
      agency: "Медицинская организация, выдавшая направление на МСЭ",
      responsible: { role: "parent", label: "Родитель" },
      documents: [{ document_id: "mse_referral", title: "Направление на МСЭ", required: true }],
      eligibility: { answer: "DISABILITY_STATUS", in: ["in_progress"] },
      prerequisites: { actions: [], facts: ["mse_referral_confirmed"] },
      provides_facts: [],
      deadline: {
        kind: "internal_target", trigger: "plan_approved",
        duration: { amount: 10, unit: "calendar_days" }, source: internal("Срок МСЭ не сверен с первичным источником"),
      },
      parent_can_complete: true,
      explanation_template: "Направление на МСЭ оформлено медицинской организацией. Проверьте с ней, что пакет документов полный.",
    },
    {
      action_id: "MSE_COMPLETE",
      title: "Пройти медико-социальную экспертизу",
      agency: "Подразделение МСЭ",
      responsible: { role: "agency", label: "Подразделение МСЭ" },
      documents: [{ document_id: "mse_referral", title: "Направление на МСЭ", required: true }],
      eligibility: { answer: "DISABILITY_STATUS", in: ["in_progress"] },
      prerequisites: { actions: ["MSE_PREPARE"], facts: ["mse_referral_confirmed"] },
      provides_facts: [],
      deadline: {
        kind: "internal_target", trigger: "prerequisite_completed",
        duration: { amount: 30, unit: "calendar_days" }, source: internal("Срок МСЭ не сверен с первичным источником"),
      },
      parent_can_complete: false,
      explanation_template: "Экспертиза проводится по направлению медицинской организации. Куратор отметит её результат.",
    },
    {
      action_id: "SOC_HOME_APPLY",
      title: "Подать документы на специальные социальные услуги на дому",
      agency: "Отдел занятости и социальных программ по месту жительства",
      responsible: { role: "parent", label: "Родитель" },
      documents: [
        parentApplication,
        { document_id: "social_services_basis", title: "Документ, подтверждающий право на специальные социальные услуги", required: true },
      ],
      eligibility: { answer: "DISABILITY_STATUS", in: ["yes"] },
      prerequisites: { actions: [], facts: ["social_services_eligibility_confirmed"] },
      provides_facts: [],
      deadline: {
        kind: "internal_target", trigger: "plan_approved",
        duration: { amount: 14, unit: "calendar_days" }, source: internal("Срок социальных услуг не сверен с первичным источником"),
      },
      parent_can_complete: false,
      explanation_template: "При подтверждённом праве отдел социальных программ может назначить помощь специалистов на дому.",
    },
  ],
};
