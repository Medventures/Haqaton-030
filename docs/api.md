# API маршрута родителя и документа ПМПК

Сайт → сохранённое интервью Supabase → OpenAI Responses API → проверка → Supabase → сайт.

## Авторизация

Сайт использует cookies Supabase. Для внешнего клиента передайте `Authorization: Bearer <Supabase access_token>`.
Идентификатор пользователя сервер получает из проверенной сессии. OpenAI API key и Supabase secret key клиенту не выдаются.

## GET /api/agent/route

Возвращает только маршрут текущего пользователя, без вызова модели. Ответ содержит `status` (`empty`, `generating`, `ready`, `failed`), `stale`, `plan`, `error`.
Если интервью изменилось, `stale: true`, а `plan: null`. Истёкшая генерация возвращается как `failed` с кодом `generation_expired`; её можно запустить снова.

## POST /api/agent/route

Тело: `{}` либо `{"regenerate": true}`. Ответы и user_id в запросе не принимаются.
Завершённое интервью читается из Supabase. По умолчанию уже готовый маршрут для тех же ответов возвращается без платного вызова модели.
`regenerate: true` явно создаёт новый маршрут. Лимиты: одна активная генерация, одна попытка в минуту и 20 попыток за UTC-день на пользователя.

```bash
curl --request POST "$APP_URL/api/agent/route" \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{}'

curl "$APP_URL/api/agent/route" \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

В браузере сайта:

```js
const response = await fetch('/api/agent/route', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});
const result = await response.json();
```

Успех: `200`, параллельная генерация: `202` (читайте GET до завершения). Ошибки: `400` неправильное тело, `401` нет сессии, `403` неправильный Origin для cookies, `409` интервью не завершено/изменилось, `422` нет допустимых действий/отказ модели, `429` локальный лимит, `502` невалидный ответ модели, `503` недоступная конфигурация/БД/OpenAI. Ошибка имеет вид `{"error":{"code":"...","message":"..."}}`.

Сгенерированный результат — предварительный маршрут `parent-route-1`, а не старый CasePlan с approval куратора. Модель выбирает action_id, priority и rationale; организации, документы, зависимости и правила сроков добавляются сервером из каталога. Для автоматически добавленных prerequisite объяснение помечено `catalog_template`; текст модели — `ai`.

Фактические даты приёмов, поиск центров и отправка заявлений не выполняются. Сроки показаны как правила из справочника с триггерами, без выдуманного due_at.

OpenAPI: `/openapi.json`.

## Документ ПМПК

Загрузка → оригинал в закрытом Storage → разбор OpenAI → проверка родителем → маршрут. Авторизация — как выше. Один документ на родителя.
Подробный контракт: `.archcore/document-intake.spec.md`; OpenAPI: `/openapi.json`.

| Endpoint | Действие |
|---|---|
| `GET /api/pmpk` | Текущий документ (`document: null`, если его нет). Используйте после перезагрузки страницы |
| `POST /api/pmpk` | `{mime_type, size_bytes, consent: true}` → `201` с `document` и `upload: {bucket, path}` |
| `POST /api/pmpk/{id}/parse` | Запустить разбор после загрузки файла. `202`, если он уже идёт |
| `GET /api/pmpk/{id}` | Статус и результат, `file_url` — подписанная ссылка на оригинал на 5 минут |
| `POST /api/pmpk/{id}/retry` | Повторить разбор после `failed` |
| `POST /api/pmpk/{id}/confirm` | `{revision, confirmed: {...}}` — проверенные родителем поля |
| `DELETE /api/pmpk/{id}` | Удалить документ и файл; `204` только после удаления обоих |
| `POST /api/interview/reset` | Очистить анкету, документ с файлом и маршрут; `204` только после полной очистки |

Файл браузер загружает сам, сессией пользователя, по пути из `upload` (`supabase.storage.from(bucket).upload(path, file)`); сервер файл не принимает.
Статусы: `pending_upload` → `parsing` → `needs_review` → `confirmed`, либо `failed` (`error.code`).
Подтверждение принимает только `revision`, который видел родитель; после нового разбора он меняется (`409 revision_conflict`).
Подтверждённое заключение ПМПК делает шаги маршрута, ждавшие его, доступными и убирает этапы ПМПК; сохранённый маршрут при этом становится `stale`.

```js
const { document, upload } = await (await fetch('/api/pmpk', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mime_type: file.type, size_bytes: file.size, consent: true }),
})).json();
await supabase.storage.from(upload.bucket).upload(upload.path, file, { contentType: file.type });
await fetch(`/api/pmpk/${document.id}/parse`, { method: 'POST' });
```

Ошибки: `400` тело или нет согласия, `404` документ не найден, `409` документ уже есть / устаревшая ревизия / документ удалён во время разбора, `422` файл не читается или не заключение ПМПК, `429` лимит (одна попытка в 30 секунд, 10 за UTC-день), `502` невалидный ответ модели, `503` конфигурация, OpenAI или незавершённая очистка (`cleanup_incomplete` — повторите вызов).
Файл при разборе уходит в OpenAI только после согласия родителя; повторное удаление безопасно: оно дочищает файлы.
