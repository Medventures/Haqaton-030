---
title: "Контракт Canonical CasePlan v1 (AqylRoute)"
status: draft
tags:
  - "aqylroute"
  - "case-plan"
  - "mvp"
---

## Purpose & Scope
Спека задаёт контракт Canonical CasePlan v1: структуру JSON, статусы, генерацию из справочника, утверждение куратором, сроки и эскалацию просрочки. Контракт нужен серверу API, валидатору плана, экранам родителя и куратора. Вне области: содержимое справочника услуг, банк вопросов интервью (`interview-flow.spec.md`), авторизация, выбор стека. Кода пока нет: спека фиксирует контракт заранее.

## Surface
- Корень `plan_json`: `schema_version`, `catalog_version`, `case_id`, `jurisdiction`, `created_at`, `plan_status`, `profile`, `approval`, `steps[]`. Поля `diagnosis` нет.
- `profile`: `child_age_months`, `region_code`, `education_stage`, `support_goals` (обезличенные значения).
- `approval`: `required`, `status`, `curator_id`, `approved_at`.
- Шаг: `step_id`, `action_id`, `title`, `agency`, `priority`, `responsible`, `explanation`, `explanation_source`, `depends_on`, `documents[]`, `deadline`, `status`, `status_updated_at`, `overdue`, `escalation`.
- `explanation_source`: `ai` (текст модели прошёл проверку) или `catalog_template` (заранее проверенный шаблон из справочника).
- `deadline`: `kind` (`statutory`, `service_duration`, `internal_target`), `trigger`, `trigger_at`, `due_at`, `source`.
- `overdue`: `is_overdue`, `days`. `escalation`: `state` (значение `curator_attention_required`).
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

## Constraints & Invariants
- Invariant: `approved` MUST NOT быть статусом шага; статус плана и статус шага не смешиваются.
- Invariant: состояние задания генерации (`queued`, `running`, `succeeded`, `failed`), `workflow_state` кейса и `plan_status` — разные поля; ни одно не выводится из другого без явной операции.
- Invariant: жалобу в государственный орган система MUST NOT отправлять автоматически; эскалация идёт только внутри интерфейса.
- Invariant: куратор MUST NOT создавать услугу текстом; допустим только `action_id` из справочника.
- Constraint: модель MUST NOT назначать официальный срок, документы, ответственного и диагноз; эти поля дают справочник и сервер.
- Не сверено с первичными источниками (взято из материала @rnd.md): срок назначения даты ПМПК (2 рабочих дня), ожидание обследования (до 30 календарных дней), срок услуги поддержки (90-365 дней).
- Не сверено: правило расчёта рабочих дней (календарь праздников и переносов РК).
- Решено 30.09.2026 (PLAN.md): терминальны `completed` и `cancelled` (клауза 33). Действие без основания исключается из допустимого списка, действие с выполнимым prerequisite попадает в план как `blocked` (клаузы 8-9); это снимает противоречие материала между таблицей кейса A и чек-листом.
- Решено 30.09.2026: куратор назначается сервером при создании кейса (клауза 31). Правило распределения между несколькими кураторами — вне первого релиза.

## Failure Behavior
1. IF валидатор отклоняет генерацию, THEN the сервер MUST NOT создавать план со статусом `pending_curator` и MUST перевести кейс в `generation_failed` с безопасным кодом ошибки.
2. IF транзакция смены статуса не завершилась, THEN the сервер MUST сохранить прежний статус шага.
3. IF запрос не проходит проверку роли, THEN the сервер MUST вернуть отказ без данных чужого кейса.
4. IF серверная конфигурация не задаёт демо-куратора, THEN the сервер MUST отказать в создании кейса с явной ошибкой конфигурации и MUST NOT создавать кейс без куратора.

## Conformance
Реализация соответствует спеке, когда выполняет клаузы 1-33, держит инварианты и следует правилам отказа. Пример: Given срок шага наступил 23.09; When наступает 30.09 и шаг `waiting_external`; Then `is_overdue` равен true, `days` равен 7 без вызова модели.
