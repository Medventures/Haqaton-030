---
title: "Контракт Canonical CasePlan v1 (AqylRoute)"
status: rejected
tags:
  - "aqylroute"
  - "case-plan"
  - "mvp"
---

## Purpose & Scope
Спека задаёт контракт Canonical CasePlan v1: структуру JSON, статусы, генерацию из справочника, утверждение куратором, сроки и эскалацию просрочки. Контракт нужен серверу API, валидатору плана, экранам родителя и куратора. Вне области: содержимое справочника услуг, банк вопросов интервью (`interview-flow.spec.md`), авторизация, выбор стека. Статус: отклонена 30.09.2026 вместе с кураторским потоком (@.archcore/agent-timeline-mvp.adr.md). Код DATA-01…04 (схема, валидатор, переходы, справочник, fixtures, миграция 0003) написан по этой спеке и остаётся ссылкой до нового контракта Case Plan без куратора.

## Surface
- Корень `plan_json`: `schema_version`, `catalog_version`, `case_id`, `jurisdiction`, `created_at`, `plan_status`, `profile`, `approval`, `steps[]`. Поля `diagnosis` нет.
- `profile`: `child_age_years`, `age_band` (`0-2`, `3-6`, `7-13`, `14-17`), `region_code` (ISO 3166-2:KZ либо `KZ-OTHER`), `education_stage` (`none`, `kindergarten`, `school`), `support_goals` (значения вопроса `MAIN_PRIORITY`). Только обезличенные значения; вопрос банка задаёт возраст в полных годах.
- `approval`: `required`, `status` (`pending`, `approved`), `curator_id`, `approved_at`, `plan_revision` (ревизия `case_plans.revision`, которую утвердил куратор).
- Код контракта: схема `src/domain/case-plan/schema.ts`, валидатор инвариантов `src/domain/case-plan/validate.ts`, справочник `src/domain/catalog/v1.ts`, fixtures A/B `src/domain/fixtures/cases.ts`.
- Шаг: `step_id`, `action_id`, `title`, `agency`, `priority` (`high`, `medium`, `low`), `responsible` (`role`: `parent`, `curator`, `agency`; `label`), `explanation`, `explanation_source`, `depends_on`, `requires_facts`, `documents[]` (`document_id`, `title`, `required`), `deadline`, `status`, `status_updated_at`, `submitted_at`, `completed_at`, `overdue`, `escalation`.
- `explanation_source`: `ai` (текст модели прошёл проверку) или `catalog_template` (заранее проверенный шаблон из справочника).
- `deadline`: `kind` (`statutory`, `service_duration`, `internal_target`), `trigger` (`plan_approved`, `self_submitted`, `pmpk_application_submitted`, `pmpk_conclusion_confirmed`, `prerequisite_completed`), `trigger_at`, `due_at`, `duration` (`amount`, `unit`: `working_days` или `calendar_days`; для `service_duration` — `min_days`, `max_days`), `source` (`title`, `url`, `clause`). `trigger_at` и `due_at` равны `null`, пока триггер не наступил.
- `overdue`: `is_overdue`, `days`. `escalation`: `state` (`none`, `curator_attention_required`). Оба поля — снимок последнего расчёта; API пересчитывает их при каждом чтении.
- Подтверждённые куратором факты кейса: `cases.confirmed_facts_json` — `pmpk_conclusion_confirmed`, `mse_referral_confirmed`, `home_schooling_vkk_confirmed`, `social_services_eligibility_confirmed`. Это единственный источник eligibility-флагов; свободный текст родителя и текст модели их не устанавливают. `requires_facts` шага перечисляет нужные факты.
- Статусы шага: `draft`, `ready`, `submitted`, `scheduled`, `in_progress`, `waiting_external`, `blocked`, `completed`, `cancelled`. Терминальные: `completed`, `cancelled`.
- Статусы плана: `pending_curator`, `approved`, `returned_for_revision`, `closed`. `closed` остаётся в контракте, но пользовательской операции закрытия в первом релизе нет.
- Состояние кейса `cases.workflow_state`: `interview_in_progress`, `generating`, `generation_failed`, `pending_curator`, `returned_for_revision`, `approved`. Это краткое безопасное состояние для кабинетов; оно не заменяет `plan_status`.
- Назначение: `cases.parent_id`, `cases.curator_id`.
- Конвейер: InterviewState, rules engine, Structured Output `{action_id, priority, rationale}[]`, валидатор, наполнение из справочника.
- Хранение: `case_plans.plan_json` и журнал `case_events` (имена из материала).

## Normative Behavior
1. The сервер MUST хранить план как один JSON-объект `plan_json` с полями корня из Surface.
2. The сервер MUST NOT добавлять в `plan_json` поле `diagnosis`, даже пустое.
3. WHEN сервер сохраняет план, the сервер MUST записать `schema_version` и `catalog_version`.
4. WHEN родитель завершает интервью, the rules engine MUST вычислить список допустимых `action_id`.
5. WHEN сервер вызывает модель, the сервер MUST передать ей только допустимые `action_id` и обезличенный контекст.
6. WHEN сервер вызывает модель, the сервер MUST задать strict Structured Output со схемой `{action_id, priority, rationale}[]`.
7. IF ответ модели содержит `action_id` вне допустимого списка, THEN the валидатор MUST отклонить ответ.
8. The rules engine MUST исключить из допустимого списка действие, для которого нет необходимого правового или eligibility-основания (например, клауза 28).
9. IF у выбранного действия не выполнен prerequisite, который семья может выполнить в рамках маршрута, THEN the валидатор MUST сохранить шаг в статусе `blocked` с явной зависимостью в `depends_on` и MUST NOT присваивать ему `ready`. IF prerequisite отсутствует в плане и его нельзя добавить из допустимого списка, THEN the валидатор MUST отклонить генерацию.
10. IF текст объяснения содержит диагностическое утверждение или нарушает ограничения длины, THEN the валидатор MUST отклонить этот текст. The сервер MAY запросить новую генерацию в пределах общего лимита попыток задания; после исчерпания лимита the сервер MAY подставить шаблон объяснения из справочника с `explanation_source` равным `catalog_template`. The сервер MUST NOT выдавать шаблон за результат модели.
11. WHEN валидатор принимает ответ, the сервер MUST взять `title`, `agency`, `responsible`, `documents` только из справочника.
12. WHEN шаг имеет нормативный срок, the сервер MUST взять `deadline` только из справочника.
13. WHEN валидатор принимает ответ, the сервер MUST одной транзакцией сохранить план с `plan_status` равным `pending_curator`, записать событие генерации и перевести кейс в `workflow_state` равный `pending_curator`. До этого момента `plan_status` не существует.
14. WHILE `plan_status` не равен `approved`, the интерфейс и API родителя MUST NOT отдавать содержимое плана; родитель видит только `workflow_state`.
15. WHILE `plan_status` равен `pending_curator`, the куратор MAY менять `priority` шага.
16. WHILE `plan_status` равен `pending_curator`, the куратор MAY удалить шаг.
17. WHEN куратор добавляет шаг, the сервер MUST принять только `action_id` из справочника.
18. WHEN куратор утверждает план, the сервер MUST создать неизменяемую запись `approval` для конкретной ревизии плана и установить `plan_status` в `approved`.
19. WHEN `plan_status` становится `approved`, the интерфейс родителя MUST показать план.
20. WHEN куратор или родитель меняет статус шага, the сервер MUST обновить `plan_json` и записать событие в `case_events` одной транзакцией.
21. The сервер MUST вычислять `overdue` из `due_at` и статуса шага без вызова модели.
22. WHEN `due_at` прошёл и шаг не в терминальном статусе, the сервер MUST установить `is_overdue` в true.
23. WHEN шаг становится просроченным, the сервер MUST отправить уведомление куратору.
24. WHILE шаг просрочен, the сервер MUST держать шаг в очереди эскалации куратора.
25. WHEN до `due_at` остаётся не более 2 рабочих дней, the интерфейс MUST показать «Срок приближается».
26. WHILE шаг просрочен, the интерфейс MUST показать просрочку родителю и куратору.
27. WHEN `deadline.kind` равен `internal_target`, the интерфейс MUST NOT называть срок нормативным.
28. IF в интервью нет направления на МСЭ, THEN the rules engine MUST NOT допускать `MSE_PREPARE` и `MSE_COMPLETE`.
29. WHEN родитель запрашивает чужой кейс, the сервер MUST отказать в доступе.
30. WHEN OpenAI недоступен после утверждения, the сервер MUST продолжать вести статусы, сроки, просрочку и роли.
31. WHEN сервер создаёт кейс, the сервер MUST в той же транзакции назначить `curator_id` по серверному правилу. В первом релизе правило одно: демо-куратор из серверной конфигурации. Клиентский `curator_id` MUST NOT приниматься.
32. WHILE у кейса нет назначенного куратора, the сервер MUST NOT создавать задание генерации для этого кейса.
33. WHILE шаг в терминальном статусе, the сервер MUST NOT переводить его в другой статус через пользовательские операции; исправление ошибки идёт отдельной административной процедурой с записью в историю.

## Step Transitions
Решено 30.09.2026 (DATA-01). Это whitelist; остальные переходы запрещены. Код: `src/domain/case-plan/transitions.ts`.

| Из | Действие | В | Кто |
|---|---|---|---|
| — | генерация или ручная сборка | `draft` либо `blocked` | сервер: `blocked`, если не выполнена зависимость или нет факта из `requires_facts` |
| `draft` | утверждение плана | `ready` | сервер по действию куратора |
| `blocked` | зависимости завершены и факты подтверждены | `ready` | сервер после действия куратора |
| `ready` | подача с датой | `submitted` | родитель для шага с `responsible.role = parent`; куратор |
| `submitted` | ожидание внешнего ответа | `waiting_external` | куратор |
| `submitted`, `waiting_external` | подтверждённая дата | `scheduled` | куратор |
| `ready`, `scheduled` | начало исполнения | `in_progress` | куратор |
| `ready`, `submitted`, `scheduled`, `in_progress`, `waiting_external` | результат подтверждён | `completed` | куратор; родитель — только для действия с `parent_can_complete` в справочнике |
| любой нетерминальный | отмена с причиной | `cancelled` | куратор |

34. The сервер MUST присваивать шагу при генерации только `draft` или `blocked`; `ready` появляется только при утверждении либо разблокировке.
35. WHEN сервер фиксирует `submitted`, the сервер MUST записать `submitted_at`; для триггера `self_submitted` это `trigger_at`.
36. WHEN куратор подтверждает факт, the сервер MUST одной транзакцией записать факт в `cases.confirmed_facts_json`, событие в `case_events` и перевести в `ready` каждый `blocked` шаг, у которого выполнены все зависимости и факты.
37. The родитель MUST NOT подтверждать факты и MUST NOT отменять шаги.

## Constraints & Invariants
- Invariant: `approved` MUST NOT быть статусом шага; статус плана и статус шага не смешиваются.
- Invariant: состояние задания генерации (`queued`, `running`, `succeeded`, `failed`), `workflow_state` кейса и `plan_status` — разные поля; ни одно не выводится из другого без явной операции.
- Invariant: жалобу в государственный орган система MUST NOT отправлять автоматически; эскалация идёт только внутри интерфейса.
- Invariant: куратор MUST NOT создавать услугу текстом; допустим только `action_id` из справочника.
- Constraint: модель MUST NOT назначать официальный срок, документы, ответственного и диагноз; эти поля дают справочник и сервер.
- Сверено 30.09.2026 с приказом МОН РК от 27.05.2020 № 223 (https://adilet.zan.kz/rus/docs/V2000020744), п. 4 стандартов услуг: при обращении через портал дата обследования ПМПК назначается в течение 2 рабочих дней (при личном обращении — в день обращения); очередь на обследование — до 30 календарных дней; реабилитация и социальная адаптация — от 90 до 365 календарных дней; приём документов на обучение на дому — 2 рабочих дня. Отсчёт 30 дней очереди от подачи заявления — толкование AqylRoute. Сроки МСЭ и социальных услуг не сверены: в справочнике они только `internal_target`.
- Не сверено: правило расчёта рабочих дней (календарь праздников и переносов РК).
- Решено 30.09.2026: терминальны `completed` и `cancelled` (клауза 33). Действие без основания исключается из допустимого списка, действие с выполнимым prerequisite попадает в план как `blocked` (клаузы 8-9); это снимает противоречие материала между таблицей кейса A и чек-листом.
- Решено 30.09.2026: куратор назначается сервером при создании кейса (клауза 31). Правило распределения между несколькими кураторами — вне первого релиза.

## Failure Behavior
1. IF валидатор отклоняет генерацию, THEN the сервер MUST NOT создавать план со статусом `pending_curator` и MUST перевести кейс в `generation_failed` с безопасным кодом ошибки.
2. IF транзакция смены статуса не завершилась, THEN the сервер MUST сохранить прежний статус шага.
3. IF запрос не проходит проверку роли, THEN the сервер MUST вернуть отказ без данных чужого кейса.
4. IF серверная конфигурация не задаёт демо-куратора, THEN the сервер MUST отказать в создании кейса с явной ошибкой конфигурации и MUST NOT создавать кейс без куратора.

## Conformance
Реализация соответствует спеке, когда выполняет клаузы 1-37, держит инварианты и следует правилам отказа. Пример: Given срок шага наступил 23.09; When наступает 30.09 и шаг `waiting_external`; Then `is_overdue` равен true, `days` равен 7 без вызова модели.
