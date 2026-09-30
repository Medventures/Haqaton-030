---
title: "Контракт чата родителя на dashboard"
status: rejected
tags:
  - "actor:parent"
  - "ai"
  - "aqylroute"
  - "mvp"
---

## Purpose & Scope

Контракт текущего чата родителя: @src/app/parent/parent-chat.tsx, @src/app/api/chat/route.ts, @src/lib/chat-context.ts. Чат отвечает на вопросы по сохранённым данным интервью. Он не создаёт Case Plan и не заменяет отдельный конвейер генерации плана.

## Surface

- UI: блок чата только на @src/app/parent/page.tsx.
- API: `POST /api/chat`, тело `{messages: UIMessage[]}`, поток AI SDK UIMessage в ответе.
- Источник контекста: `interview_sessions.answers_json` текущего пользователя.
- В OpenAI передаются только валидные ответы с кодами вопросов; место проживания и регистрации исключены.

## Normative Behavior

1. WHEN родитель отправляет вопрос, the API MUST проверить подписанную Supabase-сессию.
2. IF сессии нет, THEN the API MUST вернуть HTTP 401 без вызова OpenAI.
3. WHEN API принимает историю, the API MUST ограничить её двадцатью текстовыми сообщениями по 2000 символов.
4. IF история невалидна, THEN the API MUST вернуть HTTP 400.
5. WHEN API собирает контекст, the API MUST читать ответы только владельца сессии.
6. WHEN API собирает контекст, the API MUST исключить email, имя и точное местоположение.
7. WHEN OpenAI настроен, the API MUST передать инструкции против диагноза и ложного статуса готового плана.
8. IF OpenAI не настроен, THEN the API MUST вернуть HTTP 503.
9. WHEN OpenAI отвечает, the API MUST отдавать ответ потоком в формате UIMessage.

## Constraints & Invariants

- Переписка хранится только в памяти вкладки; сервер не сохраняет сообщения.
- Чат даёт справочную подсказку. Он не подтверждает право на услугу, официальный срок или диагноз.
- Смена ответов интервью влияет на следующий запрос, а не на уже показанный ответ.

## Failure Behavior

1. IF база не возвращает ответы интервью, THEN the API MUST вернуть HTTP 503 без вызова OpenAI.
2. IF тело запроса слишком велико, THEN the API MUST вернуть HTTP 413.

## Conformance

Проверить вход родителя и поток ответа, HTTP 401 без сессии, HTTP 400 на невалидное тело, HTTP 503 без OpenAI-конфигурации.