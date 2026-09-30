---
title: "Генерация маршрута: сайт, Supabase и OpenAI"
status: draft
tags: [aqylroute, ai, api, parent]
---

## Purpose & Scope
Сохранённое интервью превращается в предварительный маршрут текущего родителя через OpenAI, затем сохраняется в Supabase.
Код: @src/app/api/agent/route/route.ts, @src/server/parent-route-api.ts, @src/server/route-openai.ts, @src/domain/parent-route.ts.
Родительский поток выбран в принятом решении о визуализации агента. Контракт не использует старый CasePlan с куратором.
Поиск организаций, доступных слотов и внешняя запись находятся вне этой реализации.

## Surface
- `GET /api/agent/route`: состояние `empty/generating/ready/failed`, `stale`, `plan`, `error`.
- `POST /api/agent/route`: `{regenerate?: boolean}`; cookies Supabase либо Bearer access_token.
- Источник: завершённое `interview_sessions` текущего пользователя; хранение: `parent_ai_routes`.
- JSON `parent-route-1`: версия каталога, дата генерации, модель, `source: openai`, шаги.
- Шаг: ID справочника, название, организация, приоритет, объяснение/источник, зависимости, условия, документы и правило срока.
- Миграция: @supabase/migrations/202609300001_parent_ai_routes.sql. Документация: @docs/api.md, @public/openapi.json.

## Normative Behavior
1. WHEN клиент запрашивает маршрут, the сервер MUST проверить Supabase-сессию.
2. WHEN сервер определяет владельца, the сервер MUST использовать идентификатор проверенной сессии.
3. WHEN клиент отправляет изменение с cookies, the сервер MUST проверить Origin по APP_URL.
4. WHEN сервер начинает генерацию, the сервер MUST прочитать завершённое интервью из Supabase.
5. WHEN сервер вызывает OpenAI, the сервер MUST исключить имя, email, город, район и свободные поля интервью.
6. WHEN сервер вызывает OpenAI, the сервер MUST ограничить action_id допустимым набором через strict Structured Outputs.
7. WHEN сервер собирает маршрут, the сервер MUST добавить организации, документы, зависимости и правила сроков из справочника.
8. WHEN сервер проверяет объяснение, the сервер MUST отклонить диагностические формулировки и утверждения о выполненной внешней записи.
9. WHEN сервер добавляет prerequisite, the сервер MUST пометить его шаблонное объяснение источником catalog_template.
10. WHEN сервер сохраняет результат, the сервер MUST сверить снимок ответов, снимок подтверждённых фактов и идентификатор активной генерации.
11. WHEN ответы или подтверждённые факты (документ ПМПК, @.archcore/document-intake.spec.md) изменились, the сервер MUST скрыть прежний маршрут до новой генерации.
12. WHEN готовый маршрут соответствует ответам, the сервер MUST переиспользовать его без вызова модели, если regenerate отсутствует.
13. WHILE генерация активна, the сервер MUST отказать в запуске второй генерации для того же пользователя.
14. WHEN сервер принимает попытку, the база MUST ограничить частоту одной минутой и двадцатью попытками за UTC-день.
15. WHEN клиент читает сохранённый маршрут, the RLS MUST ограничить чтение владельцем.
16. WHEN клиент меняет таблицу напрямую, the права базы MUST запретить запись.
17. WHEN сервер возвращает закрытый ответ, the сервер MUST установить Cache-Control private, no-store.
18. WHEN интерфейс сообщает о результате, the интерфейс MUST показывать только проверенный сохранённый маршрут.

## Constraints & Invariants
- Права изменения таблицы и исполнения RPC есть только у service_role; секретный клиент создаётся после проверки пользователя.
- Claim и finish выполняются отдельными транзакциями; запрос OpenAI идёт между ними.
- Lease: две минуты. HTTP-вызов модели: максимум 70 секунд, без автоматических платных повторов.
- Поля сроков описывают правила; due_at и даты записи не выдумываются.

## Failure Behavior
1. IF интервью не завершено, THEN the сервер MUST вернуть 409 без вызова модели.
2. IF OpenAI недоступен, THEN the сервер MUST вернуть безопасную ошибку и сохранить failed для активного задания.
3. IF lease истекла, THEN the GET MUST показать ошибку generation_expired с возможностью нового POST.
4. IF ответы или подтверждённые факты изменились во время генерации, THEN the база MUST отклонить сохранение результата (`interview_changed`, `facts_changed`).

## Conformance
@src/domain/parent-route.test.ts, @src/server/parent-route-api.test.ts, @src/server/route-openai.test.ts и @supabase/tests/parent_ai_routes.test.sql.
Живой сценарий: войти, завершить интервью, POST, GET после перезагрузки; чужой JWT не читает результат.
