---
title: "MVP: Next.js Route Handlers на Vercel, OpenAI и Supabase"
status: accepted
tags:
  - "aqylroute"
  - "mvp"
  - "deployment"
---

## Context

30.09.2026 пользователь запросил план интеграции Next.js, OpenAI API и Supabase. Первый вариант предполагал VPS с Docker Compose, Nginx и отдельным worker. В тот же день пользователь выбрал Vercel вместо VPS. Supabase Auth и две роли уже приняты в `auth/supabase-auth-roles.adr.md`. Supabase-проект подключён через интеграцию Vercel: `.env.local` содержит `POSTGRES_URL_NON_POOLING`.

## Decision

- Серверный слой — App Router Route Handlers (`src/app/api/**/route.ts`) на Node.js runtime. Pages Router не вводим.
- Хостинг — Vercel. Docker, Nginx и VPS в первый релиз не входят.
- Генерация плана: Route Handler создаёт задание в `generation_jobs`, отвечает `202` и выполняет вызов OpenAI в `after()` с `maxDuration`. Задание с истёкшей lease повторно берёт запрос состояния генерации либо защищённый `CRON_SECRET` cron-endpoint.
- Периодический проход сроков и уведомления — `pg_cron` в Supabase. Причина: Vercel Cron на тарифе Hobby запускается не чаще раза в сутки. Страницы всё равно пересчитывают просрочку при открытии.
- Многошаговые записи (статус + ревизия + событие) — функции Postgres, вызываемые через RPC; supabase-js сам транзакции не открывает.
- Миграции — SQL-файлы в `supabase/migrations`, применяются через `psql "$POSTGRES_URL_NON_POOLING"`.
- UI-компоненты — shadcn/ui поверх Tailwind 4 и токенов `DESIGN.md`.
- Имена переменных — как в PLAN.md: `APP_URL`, `SUPABASE_SECRET_KEY`, `DEMO_ENABLED`, `DEMO_CURATOR_EMAIL`, `CRON_SECRET`.

План задач и приёмки: [PLAN.md](../PLAN.md).

## Alternatives Considered

- VPS + Docker Compose + Nginx + отдельный worker: больше контроля над фоновыми задачами, но нужна эксплуатация сервера. Отклонено пользователем 30.09.2026.
- Pages Router API Routes (`pages/api`): работает, но добавляет второй роутер к App Router.

## Consequences

Нет собственной инфраструктуры и отдельного worker. Длительность генерации ограничена `maxDuration` тарифа Vercel. Логика просрочки существует дважды — в TypeScript для страниц и в SQL для `pg_cron`; их совпадение проверяется тестом.
