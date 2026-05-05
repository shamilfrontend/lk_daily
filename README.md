# LK Daily — очередь демонстраций на ежедневных созвонах

Веб-приложение по ТЗ: несколько команд, у каждой своя очередь участников, учёт отпусков и нерабочих дней (MVP), JWT-админ и публичное чтение API.

## Требования

- Node.js 20+
- Yarn 1.x
- Локально запущенный MongoDB (`mongod` или облако), либу [Docker Compose](#docker-compose-api--mongodb)

## Переменные окружения (backend)

Скопируйте `backend/.env.example` в `backend/.env` и при необходимости измените значения:

- `PORT` — порт API (по умолчанию `4000`)
- `MONGO_URI` — строка подключения MongoDB
- `JWT_SECRET` — секрет подписи JWT
- `ADMIN_LOGIN`, `ADMIN_PASSWORD` — учётная запись администратора (создаётся при первом старте, если коллекция `Admin` пуста)
- `CORS_ORIGINS` — через запятую список разрешённых origin фронта (например `http://localhost:5173`). **Пусто** — разрешены все origin (удобно для разработки). В продакшене задайте явный список.
- `RATE_LIMIT_LOGIN_MAX` — максимум запросов на `POST /api/auth/login` с одного IP за 15 минут (по умолчанию `50`)
- `OUTBOUND_WEBHOOK_URL` — URL для исходящих уведомлений (например Slack Incoming Webhook); без него `POST /api/hooks/notify-today` вернёт 503
- `WEBHOOK_TRIGGER_SECRET` — секрет вызова `POST /api/hooks/notify-today` (`Authorization: Bearer …` или `X-Lk-Daily-Secret`); пусто — эндпоинт отключён (404)

### Продакшен: чеклист

- Задайте сильный `JWT_SECRET` и надёжный пароль администратора.
- Укажите `CORS_ORIGINS` со списком доверенных origin фронта (не оставляйте список пустым в открытом интернете).
- Настройте резервное копирование MongoDB и мониторинг диска.
- Проверка жизнеспособности API: `GET /health` — `200` и `"mongo":"connected"`, если MongoDB доступна; иначе `503`.
- Публичные `GET` (история, экспорты) осознанно открыты; при необходимости ограничьте доступ сетью или отдельным слоем авторизации.

### Порядок внедрения улучшений (кратко)

1. Операционная готовность: health, чеклист, CORS/секреты.  
2. UX: подсказки на главной, ссылка на команду, ICS.  
3. Интеграции: исходящий webhook по расписанию (внешний cron → `POST /api/hooks/notify-today`).  
4. Подмена докладчика на день: API и админ-форма «Очередь».

## Запуск

В **двух** терминалах:

```bash
cd backend
cp .env.example .env   # при первом запуске
yarn install
yarn dev
```

```bash
cd frontend
yarn install
yarn dev
```

Frontend по умолчанию: http://localhost:5173  
API: http://localhost:4000  

В режиме разработки Vite проксирует запросы с `/api` на `http://localhost:4000`.

### Сборка production

```bash
cd backend && yarn build && yarn start
cd frontend && yarn build && yarn preview
```

### Docker Compose (API + MongoDB)

Из корня репозитория:

```bash
docker compose up --build
```

API будет на порту `4000`, MongoDB на `27017`. Задайте `JWT_SECRET` и при необходимости `CORS_ORIGINS` через переменные окружения или `.env` рядом с `docker-compose.yml`.

### Тесты и линтер (backend)

```bash
cd backend
yarn test
yarn lint
```

### E2E (frontend)

Команды нужно выполнять из каталога **`frontend`**.

```bash
cd frontend
yarn install   # или npm install; при установке срабатывает postinstall с playwright install chromium
yarn e2e         # или npm run e2e — перед тестами снова вызывается playwright install chromium (быстро, если уже скачано)
```

Перед запуском тестов скрипт **`e2e`** сам выполняет `playwright install chromium`, поэтому даже при `npm install --ignore-scripts` или очистке кэша `~/.cache/ms-playwright` браузеры подтянутся.

Если ошибка «Executable doesn't exist» остаётся: `npx playwright install` или на Linux CI: `npx playwright install --with-deps chromium`.

Смок-тесты поднимают Vite (`yarn dev:e2e` в `playwright.config`) и проверяют базовую оболочку UI без обязательного backend.

**Если падает webServer / timeout:** освободите порт `5173` или остановите другой `yarn dev`. Если порт занят, Vite с `--strictPort` не стартует.

### CI

В репозитории настроен GitHub Actions: сборка backend/frontend, `yarn lint`, `yarn test` для backend, `yarn e2e` для frontend.

## MVP: что сделано

- Backend: Express + TypeScript + Mongoose, публичные `GET`, мутации только с JWT, сид админа, CRUD команд/участников/отпусков, очередь (`present` / `skip` с защитой от повтора в день), прогноз на N **рабочих** дней.
- Календарь: федеральные праздники по ст. 112 ТК РФ, переносы выходных (`HolidayTransfer`), региональные дни по `team.region`, пользовательские дни (`custom`), batch-импорт (`POST /api/non-working-days/batch`), API переносов (`/api/holiday-transfers`).
- Frontend: Vue 3 + Vite + Pinia + Vue Router + SCSS + Axios + `vuedraggable` для порядка очереди.
- Экспорт CSV и **ICS** (iCalendar): прогноз можно подписать в календаре; CSV/ICS также доступны **публично по API** (без JWT).
- Подмена докладчика на одну дату без изменения порядка очереди (`QueueDaySubstitution`, форма в админке «Очередь»).
- Исходящий webhook: `POST /api/hooks/notify-today` с секретом — текст о сегодняшнем докладчике на URL из `OUTBOUND_WEBHOOK_URL` (удобно для Slack).
- Ссылка с выбором команды: `/?teamId=<id>` — при открытии приложения выбирается команда, если такой `teamId` есть в списке; на главной есть кнопка копирования ссылки.

### Поток данных (кратко)

Команда хранит участников и регион; порядок очереди — в `QueueOrder`. Текущий докладчик считается по порядку с учётом отпусков/декрета и производственного календаря; факты выступлений пишутся в `PresentationLog` и отображаются в «Истории».

### Экспорт CSV / ICS (API)

Файл CSV: UTF-8 с BOM.

- `GET /api/history/export/csv` — те же query, что у `GET /api/history`: `teamId`, `from`, `to`, `status`. Колонки: `date`, `team`, `user`, `status`.
- `GET /api/queue/upcoming/export/csv?teamId=...&days=7` — прогноз на N рабочих дней; колонки: `moscowDate`, `weekday`, `presenter`.
- `GET /api/queue/upcoming/export/ics?teamId=...&days=7` — тот же прогноз в формате `text/calendar` (iCalendar).

### Подмена на день (API)

- `GET /api/queue/substitutions?teamId=...` — список подмен (опционально `from`, `to` в формате `YYYY-MM-DD`).
- `POST /api/queue/substitutions` (JWT) — тело: `{ teamId, moscowDate, substituteUserId }`.
- `DELETE /api/queue/substitutions?teamId=...&moscowDate=...` (JWT).

### Webhook напоминания

- `POST /api/hooks/notify-today` — тело `{ "teamId": "<id>" }`, заголовок `Authorization: Bearer <WEBHOOK_TRIGGER_SECRET>` или `X-Lk-Daily-Secret`. Отправляет JSON `{ "text": "..." }` на `OUTBOUND_WEBHOOK_URL` (совместимо с Slack Incoming Webhook).

### Обзор основных маршрутов

| Метод | Путь | JWT |
|------|------|-----|
| GET | `/health` | нет |
| POST | `/api/auth/login` | нет |
| GET | `/api/teams`, `/api/users`, … | нет (чтение) |
| POST/PUT/DELETE | мутации команд, пользователей, отпусков, очереди, подмен | да |
| POST | `/api/hooks/notify-today` | секрет в заголовке |
