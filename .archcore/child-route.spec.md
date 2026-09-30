---
title: "Контракт маршрута ребёнка и Case Plan v2"
status: draft
tags:
  - "actor:curator"
  - "actor:parent"
  - "agent"
  - "aqylroute"
  - "case-plan"
  - "mvp"
---

## Purpose & Scope

Целевой контракт маршрута ребёнка по @.archcore/digital-child-route.prd.md: объект Case Plan, этапы, статусы шага, государственный и платный путь, права ролей. Заменяет отклонённый @.archcore/case-plan-contract.spec.md. Спека написана до кода: текущие @src/domain/case-plan/schema.ts и @src/app/parent/parent-journey.tsx ей пока не соответствуют.

Вне области: разбор документов (@.archcore/document-intake.spec.md), подбор центра и запись (@.archcore/center-matching-booking.spec.md), программа и посещения (@.archcore/individual-program.spec.md).

## Surface

- Case Plan: `case_id`, `child` (имя, возраст), `current_stage`, `route_type` (`public`, `paid`), `paid_curator` (bool), `stages[]`, `documents[]`, `recommendations[]`, `individual_program`, `appointments[]`, `visits[]`, `deadlines[]`, `benefits[]`, `current_center`, `overdue`, `history[]`.
- Этапы (`stage`): `SPECIALIST_CONSULTATION`, `PMPK`, `KPPK`, `INDIVIDUAL_PROGRAM`, `REHABILITATION`, `CONTROL_ASSESSMENT`, `SOCIAL_SUPPORT`.
- Шаг этапа: `step`, `status`, `responsible` (`parent`, `institution`, `curator`, `ai`), `deadline`, `source_document_id`.
- Статусы шага: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `DECLINED_BY_PARENT`, `BLOCKED`, `OVERDUE`.
- Ответ родителя на государственный этап: `yes`, `in_progress`, `done`, `declined`.
- `history[]`: событие с датой, типом, автором (`parent`, `specialist`, `curator`, `ai`) и ссылкой на документ.

## Normative Behavior

1. WHEN в карту добавлен подтверждённый источник, the AI-куратор MUST обновить `current_stage` и шаги только по этому источнику.
2. The AI-куратор MUST NOT создавать этап или услугу без подтверждённого источника: заключения, ПМПК, программы, ИПР, плана центра, справочника услуг.
3. WHEN родитель открывает маршрут, the интерфейс MUST показать текущий этап первым, а остальные — отметками пройден / текущий / впереди.
4. The интерфейс MUST показать процент выполнения как долю `COMPLETED` среди этапов без `DECLINED_BY_PARENT`.
5. WHEN AI-куратор предлагает государственный этап, the интерфейс MUST спросить родителя: да, уже прохожу, уже прошли, не хочу.
6. WHEN родитель отвечает «не хочу», the система MUST поставить этапу `DECLINED_BY_PARENT`.
7. WHILE этап в `DECLINED_BY_PARENT`, the система MUST NOT ставить ему `OVERDUE` и MUST NOT эскалировать его.
8. WHERE услуга доступна платно, the система MUST NOT блокировать платный маршрут отказом от государственного этапа.
9. WHEN родитель отвечает «уже прошли», the система MUST поставить `COMPLETED` после загрузки подтверждающего документа.
10. IF у шага нет подтверждающего документа, THEN the система MUST оставить шаг `IN_PROGRESS`.
11. WHEN шаг ждёт незавершённый предыдущий этап, the система MUST поставить ему `BLOCKED`.
12. WHEN `deadline` прошёл и шаг не `COMPLETED` и не `DECLINED_BY_PARENT`, the система MUST поставить `OVERDUE`.
13. WHEN шаг становится `OVERDUE`, the система MUST уведомить родителя и показать шаг куратору.
14. WHEN меняется статус шага, запись или документ, the система MUST добавить событие в `history[]`.
15. WHEN куратор открывает кейс, the интерфейс MUST показать просрочки, зависшие этапы, проблемы записи и невыполнение программы.
16. WHEN куратор подтверждает маршрут или документ, the система MUST записать автора и время в `history[]`.
17. The AI-куратор MUST передать проблему человеку (куратору), когда не может выполнить действие сам.

## Constraints & Invariants

- AI не ставит диагноз и не назначает лечение или услугу. Содержание программы задаёт специалист.
- `DECLINED_BY_PARENT` — решение семьи, а не ошибка: он не входит в счётчики просрочек.
- Все действия AI, которые создают, отменяют или переносят запись, требуют подтверждения родителя.
- Интерфейс и AI не показывают медицинских выводов по анализам и консультациям — только хронологию.

## Failure Behavior

1. IF источник не читается или тип не определён, THEN the система MUST не менять маршрут и попросить родителя проверить документ.
2. IF шаг нельзя выполнить автоматически, THEN the система MUST оставить статус и создать задачу куратору.

## Conformance

- Кейс «Алихан»: @.archcore/alikhan-synthetic-case.scenario.md.
- Отказ от ПМПК не даёт `OVERDUE` и не скрывает платные центры.
- Процент выполнения меняется только при `COMPLETED` или `DECLINED_BY_PARENT`.
- Открыто: в примере PRD «43%» не совпадает с шестью этапами (2 из 6 = 33%). Формула в клаузе 4 — выбор этой спеки.
