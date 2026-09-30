---
title: "Supabase Auth с двумя ролями: куратор и родитель"
status: accepted
tags:
  - "aqylroute"
  - "auth"
  - "mvp"
---

## Context

Требования КМУ (@.archcore/kmu-task-requirements.rule.md, п. 11) разрешают SQLite или Supabase. В MVP два типа пользователей: куратор проверяет и подтверждает Case Plan, родитель проходит AI-интервью и выполняет шаги. Приложение — Next.js 16 (App Router), в нём Middleware переименован в Proxy (`src/proxy.ts`).

## Decision

- Авторизация и БД — Supabase. Пакеты: `@supabase/supabase-js`, `@supabase/ssr` (сессия в cookies).
- Клиенты: @src/lib/supabase/client.ts (браузер), @src/lib/supabase/server.ts (Server Components, Server Actions, Route Handlers; новый клиент на каждый запрос).
- @src/proxy.ts только обновляет сессию через `auth.getClaims()`. Проверки доступа по роли — в страницах/серверном коде и в RLS, не в proxy.
- Роль хранится в `public.profiles.role` (enum `user_role`: `curator`, `parent`), миграция @supabase/migrations/0001_profiles_roles.sql. Триггер создаёт профиль с ролью `parent` при регистрации. Куратора назначают вручную через SQL.
- Роль не берётся из `user_metadata`: пользователь может сам менять эти данные.
- Серверный хелпер `getUserRole()` в @src/lib/supabase/server.ts читает роль текущего пользователя.
- Переменные окружения: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (@.env.example).

## Alternatives

- SQLite + своя авторизация: больше кода на сессии и пароли, нет RLS.
- Роль в JWT через Custom Access Token Hook: быстрее (без запроса к БД), но сложнее настроить. Перейти, если чтение `profiles` на каждый запрос станет узким местом.
- Роль в `user_metadata`: небезопасно, родитель может стать куратором.

## Consequences

- Без переменных окружения proxy падает на каждом запросе — `.env.local` нужен до `pnpm dev`.
- Назначение куратора — ручной шаг в SQL; UI для этого нет [assumption: для хакатона достаточно].
- RLS сейчас только на чтение своего профиля; политики для доступа куратора к данным семей добавляются вместе с таблицами кейсов.
- Supabase CLI не установлен; миграция применяется через SQL Editor или `supabase db push` после `supabase link`.