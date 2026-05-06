# LK Daily — очередь демонстраций на ежедневных созвонах

Веб-приложение по ТЗ: несколько команд, у каждой своя очередь участников, учёт отпусков и нерабочих дней (MVP), JWT-админ и публичное чтение API.

## Требования

- Node.js 20+
- Yarn 1.x
- Локально запущенный MongoDB (`mongod` или облако), либу [Docker Compose](#docker-compose-api--mongodb)

## Переменные окружения (backend)

Скопируйте `backend/.env.example` в `backend/.env` и при необходимости измените значения:

- `PORT` — порт API (по умолчанию `4000`)
- `MONGO_URI` — строка подключения MongoDB. Операции очереди используют **транзакции** и требуют **MongoDB replica set** (в Docker Compose поднимается одноузловой `rs0`, в URI задано `?replicaSet=rs0`). Если приходит ошибка вида `Transaction numbers are only allowed on a replica set member or mongos`, значит сервер запущен как обычный standalone — см. раздел [MongoDB и replica set](#mongodb-и-replica-set).
- `JWT_SECRET` — секрет подписи JWT
- `ADMIN_LOGIN`, `ADMIN_PASSWORD` — учётная запись администратора (создаётся при первом старте, если коллекция `Admin` пуста)
- `CORS_ORIGINS` — через запятую список разрешённых origin фронта (например `http://localhost:5173`). **Пусто** — разрешены все origin (удобно для разработки). В продакшене задайте явный список.
- `RATE_LIMIT_LOGIN_MAX` — максимум запросов на `POST /api/auth/login` с одного IP за 15 минут (по умолчанию `50`)
- `RATE_LIMIT_API_MAX` — общий лимит запросов к `/api/*` с одного IP за 15 минут (по умолчанию `300`)
- `RATE_LIMIT_EXPORT_MAX` — лимит для публичных экспортов `GET /api/history/export/csv` и `GET /api/queue/upcoming/export/*` за 15 минут на IP (по умолчанию `60`)
- `OUTBOUND_WEBHOOK_URL` — URL для исходящих уведомлений (например Slack Incoming Webhook); без него `POST /api/hooks/notify-today` вернёт 503
- `WEBHOOK_TRIGGER_SECRET` — секрет вызова `POST /api/hooks/notify-today` (`Authorization: Bearer …` или `X-Lk-Daily-Secret`); пусто — эндпоинт отключён (404)

### Продакшен: чеклист

- Задайте сильный `JWT_SECRET` и надёжный пароль администратора.
- Укажите `CORS_ORIGINS` со списком доверенных origin фронта (не оставляйте список пустым в открытом интернете). В production backend откажется стартовать с дефолтными учётными данными и коротким секретом — см. [backend/src/config/env.ts](backend/src/config/env.ts).
- Настройте резервное копирование MongoDB и мониторинг диска.
- Проверка жизнеспособности API: `GET /health` — `200` и `"mongo":"connected"`, если MongoDB доступна; иначе `503`. Дополнительно: `GET /metrics` — текстовые метрики в формате Prometheus (uptime процесса).
- Публичные `GET` (история, экспорты) осознанно открыты; при необходимости ограничьте доступ сетью или отдельным слоем авторизации (см. ниже).

#### Политика доступа к публичным GET

**Как выбрать модель**

| Сценарий | Рекомендация |
|----------|--------------|
| Доступ только из офиса/VPN/DMZ | Достаточно firewall и закрытого MongoDB; публичные `GET` можно оставить как есть за периметром. |
| SPA и API на одном origin за reverse proxy | Ограничьте сеть (allowlist на proxy, закрытый порт API снаружи); мутации всё равно только с JWT. |
| API intentionally в открытом интернете и нужно закрыть только чтение | Либо отдельный read-токен на уровне backend (требует доработки и распространения секрета клиентам), либо только сетевой контур без выставления GET наружу. |

Мутации по-прежнему только с JWT администратора. Для прод-проверок конфигурации см. [backend/src/config/env.ts](backend/src/config/env.ts).

#### Мини-runbook

- Проверка API: `curl -sS http://<host>:4000/health | jq` — ожидается `ok: true`, `mongo: connected`.
- Бэкап MongoDB: снимайте дамп тома или используйте `mongodump` по расписанию; следите за местом на диске.
- Напоминание в Slack/cron: `POST /api/hooks/notify-today` с `WEBHOOK_TRIGGER_SECRET` и телом `{"teamId":"..."}` (см. раздел Webhook ниже).

### Порядок внедрения улучшений (дорожная карта)

Уже в продукте: MVP; статистика по команде (`GET /api/stats/team`, страница `/admin/stats`); подмена докладчика и обмен датами подмен (`POST /api/queue/substitutions/swap-days`); лимиты `RATE_LIMIT_API_MAX` / `RATE_LIMIT_EXPORT_MAX`; идентификатор запроса `requestId` в access-логах; `GET /metrics`; Docker Compose с nginx и CSP.

Идеи на следующие итерации:

1. **UX**: дополнительные подсказки и сценарии онбординга (базовые подсказки на главной — в интерфейсе).  
2. **Интеграции**: закрепить cron/webhook по [чеклисту ниже](#чеклист-cron--webhook-slack).  
3. **Узкий доступ к чтению** при выставлении API в интернет — см. таблицу в разделе «Политика доступа к публичным GET».  
4. **Наблюдаемость в эксплуатации**: алерты по `GET /health`, бэкапы и диск Mongo (см. [vps_settings.md](vps_settings.md)).

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

### MongoDB и replica set

Транзакции в [backend/src/services/queueService.ts](backend/src/services/queueService.ts) (`recordPresentation`, обмен подменами) работают только на **replica set** или **mongos**, не на standalone `mongod`.

- **Docker Compose** из репозитория: Mongo запускается с `--replSet rs0`, инициализация в healthcheck; API получает `MONGO_URI` с `replicaSet=rs0`.
- **Backend на хосте, Mongo в Docker** (порт `27017` проброшен): в `backend/.env` укажите  
  `MONGO_URI=mongodb://127.0.0.1:27017/lk-daily?replicaSet=rs0&directConnection=true`  
  (`directConnection=true` нужен, чтобы драйвер не подменял адрес на имя контейнера из топологии.)
- **Свой mongod на машине:** запустите с репликой и один раз выполните `rs.initiate()` (см. документацию MongoDB), затем добавьте в URI `?replicaSet=<имя>`.

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
- **MongoDB**: `27017` на хосте, данные в томе `mongo_data`; контейнер поднимает **одноузловой replica set `rs0`** (нужно для транзакций очереди).

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
- Подмена докладчика на одну дату без изменения порядка очереди (`QueueDaySubstitution`, форма в админке «Очередь»); обмен подменами между датами — `POST /api/queue/substitutions/swap-days` (JWT).
- Агрегированная статистика выступлений: `GET /api/stats/team?teamId=…` (JWT), UI — `/admin/stats`.
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
- `POST /api/queue/substitutions/swap-days` (JWT) — тело: `{ teamId, moscowDateA, moscowDateB }` (даты `YYYY-MM-DD`).
- `DELETE /api/queue/substitutions?teamId=...&moscowDate=...` (JWT).

### Статистика (API)

- `GET /api/stats/team?teamId=...` (JWT) — агрегаты по выступлениям для выбранной команды.

### Чеклист cron / webhook (Slack)

1. Задайте в окружении API `OUTBOUND_WEBHOOK_URL` (Incoming Webhook Slack) и `WEBHOOK_TRIGGER_SECRET`.
2. На сервере с доступом к API по расписанию (cron, systemd timer, GitHub Actions `schedule`, внешний uptime-сервис с HTTP):

```bash
curl -sS -X POST "https://<host>/api/hooks/notify-today" \
  -H "Authorization: Bearer <WEBHOOK_TRIGGER_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"<ID_КОМАНДЫ>"}'
```

При Docker Compose с nginx используйте URL фронта того же origin, например `https://<домен>/api/hooks/notify-today`, если reverse proxy проксирует `/api` на backend.

3. Для нескольких команд — отдельный вызов на каждую `teamId` или несколько cron-задач.

4. Проверка: при отключённом секрете эндпоинт отвечает `404`; без `OUTBOUND_WEBHOOK_URL` — `503`.

### Webhook напоминания

- `POST /api/hooks/notify-today` — тело `{ "teamId": "<id>" }`, заголовок `Authorization: Bearer <WEBHOOK_TRIGGER_SECRET>` или `X-Lk-Daily-Secret`. Отправляет JSON `{ "text": "..." }` на `OUTBOUND_WEBHOOK_URL` (совместимо с Slack Incoming Webhook).

### Обзор основных маршрутов

| Метод | Путь | Авторизация |
|------|------|-------------|
| GET | `/health` | нет |
| GET | `/metrics` | нет |
| POST | `/api/auth/login` | нет |
| GET | `/api/auth/verify` | JWT админа |
| GET | `/api/teams`, `/api/users`, `/api/vacations` | нет (`optionalAuth`) |
| GET | `/api/non-working-days`, `/api/holiday-transfers` | нет |
| GET | `/api/stats/team` | JWT админа |
| GET | `/api/queue/current`, `/api/queue/order`, `/api/queue/upcoming`, `/api/queue/substitutions` | нет |
| GET | `/api/history`, экспорты CSV/ICS | нет (экспорты с отдельным rate limit) |
| POST/PUT/DELETE | мутации команд, пользователей, отпусков, очереди, подмен | JWT админа |
| POST | `/api/hooks/notify-today` | `WEBHOOK_TRIGGER_SECRET` в заголовке |

Страницы UI: `/` (сегодня), `/history`, `/holidays`, админка — `/admin/teams`, `/admin/users`, `/admin/vacations`, `/admin/queue`, `/admin/stats`.
