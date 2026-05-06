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
- Укажите `CORS_ORIGINS` со списком доверенных origin фронта (не оставляйте список пустым в открытом интернете). В production backend откажется стартовать с дефолтными учётными данными и коротким секретом — см. [backend/src/config/env.ts](backend/src/config/env.ts).
- Настройте резервное копирование MongoDB и мониторинг диска.
- Проверка жизнеспособности API: `GET /health` — `200` и `"mongo":"connected"`, если MongoDB доступна; иначе `503`.
- Публичные `GET` (история, экспорты) осознанно открыты; при необходимости ограничьте доступ сетью или отдельным слоем авторизации (см. ниже).

#### Политика доступа к публичным GET

Для **внутренней сети** достаточно firewall/VPN. Если API доступно из интернета: либо оставьте модель «все читают» осознанно, либо добавьте отдельный слой (reverse proxy с IP allowlist, отдельный read-токен в заголовке — потребует доработки backend). Мутации по-прежнему только с JWT админа.

#### Мини-runbook

- Проверка API: `curl -sS http://<host>:4000/health | jq` — ожидается `ok: true`, `mongo: connected`.
- Бэкап MongoDB: снимайте дамп тома или используйте `mongodump` по расписанию; следите за местом на диске.
- Напоминание в Slack/cron: `POST /api/hooks/notify-today` с `WEBHOOK_TRIGGER_SECRET` и телом `{"teamId":"..."}` (см. раздел Webhook ниже).

### Порядок внедрения улучшений (дорожная карта)

Уже сделано в MVP: health, Docker Compose с nginx, ICS/экспорты, webhook, подмена докладчика на день.

Дальше по приоритету (можно брать по очереди):

1. **UX**: подсказки на главной, полировка ссылки на команду (`/?teamId=` уже есть).  
2. **Интеграции**: внешний cron → `POST /api/hooks/notify-today` с секретом (напоминание в Slack).  
3. **Узкий доступ к чтению** (если нужен интернет без открытых GET): сеть/API-gateway или расширение backend под read-токен.  
4. **Наблюдаемость**: алерты по `/health`, единый `requestId` в логах при росте нагрузки.

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

### Docker Compose (API + MongoDB + фронт)

Из корня репозитория:

```bash
cp .env.example .env   # задайте JWT_SECRET, ADMIN_LOGIN, ADMIN_PASSWORD
docker compose up --build
```

- **Фронт** (nginx + статика Vite): http://localhost:4173 — в браузере запросы идут на **`/api` того же origin**, nginx проксирует их на контейнер `api:4000`. Сборка фронта использует `VITE_API_URL=/api` по умолчанию.
- **API напрямую**: порт `4000` (удобно для отладки и `curl /health`).
- **MongoDB**: `27017` на хосте, данные в томе `mongo_data`.

Переменные для Compose см. [.env.example](.env.example). Для CORS укажите origin страницы фронта, например `CORS_ORIGINS=http://localhost:4173,http://127.0.0.1:4173`.

У статики в контейнере `frontend` включены заголовки безопасности и **Content-Security-Policy** (см. [frontend/nginx.conf](frontend/nginx.conf)); при смене домена или CDN при необходимости скорректируйте директивы.

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
