---
title: "MVP: Next.js Route Handlers на Vercel, OpenAI и Supabase"
status: accepted
tags:
  - "aqylroute"
  - "mvp"
  - "deployment"
---

## Context

30.09.2026 пользователь запросил план интеграции Next.js, OpenAI API и Supabase. Первый вариант предполагал VPS с Docker Compose, Nginx и отдельным worker. В тот же день пользователь выбрал Vercel вместо VPS. Первое решение включало две роли, но 30.09.2026 пользователь заменил его одноролевым входом (@.archcore/agent-timeline-mvp.adr.md). Supabase-проект подключён через интеграцию Vercel: `.env.local` содержит `POSTGRES_URL_NON_POOLING`.

## Decision

- Серверный слой — App Router Route Handlers (`src/app/api/**/route.ts`) на Node.js runtime. Pages Router не вводим.
- Хостинг — Vercel. Docker, Nginx и VPS в первый релиз не входят.
- Текущий dashboard показывает синтетическую визуализацию работы агента без вызова модели. OpenAI-конфигурация сохранена для будущих Route Handlers; схема фоновой генерации Case Plan перенесена в @PLAN-legacy.md до нового контракта.
- Периодический проход сроков пока не реализован. Решение о механизме будет принято вместе с новым Case Plan без куратора.
- Многошаговые записи (статус + ревизия + событие) — функции Postgres, вызываемые через RPC; supabase-js сам транзакции не открывает.
- Миграции — SQL-файлы в `supabase/migrations`, применяются через `psql "$POSTGRES_URL_NON_POOLING"`.
- UI-компоненты — shadcn/ui поверх Tailwind 4 и токенов `DESIGN.md`.
- Текущие переменные описаны в @.env.example. Серверные `OPENAI_API_KEY` и `OPENAI_MODEL` зарезервированы для следующего этапа. `CRON_SECRET` тоже зарезервирован: cron-маршрута пока нет.

План задач и приёмки: [PLAN.md](../PLAN.md).

## Alternatives Considered

- VPS + Docker Compose + Nginx + отдельный worker: больше контроля над фоновыми задачами, но нужна эксплуатация сервера. Отклонено пользователем 30.09.2026.
- Pages Router API Routes (`pages/api`): работает, но добавляет второй роутер к App Router.

## Consequences

Нет собственной инфраструктуры и отдельного worker. Генерация плана, инструменты агента и логика просрочки остаются следующим этапом; текущая визуализация использует стабы.
