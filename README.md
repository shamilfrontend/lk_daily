# LK Daily — очередь демонстраций на ежедневных созвонах

Веб-приложение по ТЗ: несколько команд, у каждой своя очередь участников, учёт отпусков и нерабочих дней (MVP), JWT-админ и публичное чтение API.

## Требования

- Node.js 20+
- Yarn 1.x
- Локально запущенный MongoDB (`mongod` или облако)

## Переменные окружения (backend)

Скопируйте `backend/.env.example` в `backend/.env` и при необходимости измените значения:

- `PORT` — порт API (по умолчанию `4000`)
- `MONGO_URI` — строка подключения MongoDB
- `JWT_SECRET` — секрет подписи JWT
- `ADMIN_LOGIN`, `ADMIN_PASSWORD` — учётная запись администратора (создаётся при первом старте, если коллекция `Admin` пуста)

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

## MVP: что сделано

- Backend: Express + TypeScript + Mongoose, публичные `GET`, мутации только с JWT, сид админа, CRUD команд/участников/отпусков, пользовательские нерабочие дни, очередь (`present` / `skip` с защитой от повтора в день), прогноз на N **рабочих** дней.
- Календарь MVP: **федеральные** праздники по фиксированному списку (ст. 112 ТК РФ) + **пользовательские** дни в БД; выходные суббота/воскресенье по дате **Europe/Moscow**. Переносы и региональные праздники — следующая итерация.
- Frontend: Vue 3 + Vite + Pinia + Vue Router + SCSS + Axios + `vuedraggable` для порядка очереди.

## Что запланировано после MVP

- Импорт производственного календаря (`/api/non-working-days/batch`), модель переносов и региональные праздники.
- Экспорт CSV истории и очереди.
