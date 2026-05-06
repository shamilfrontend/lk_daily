# Выкладка LK Daily на VPS (Ubuntu, без Docker)

Инструкция для развёртывания без домена и HTTPS: доступ по `http://<IP_VPS>:4173` (статический фронт через nginx), API на `127.0.0.1:4000` (наружу — только если открыли порт в firewall). Обновления — вручную (`git pull`, пересборка, перезапуск сервиса).

Стек: MongoDB на хосте (одноузловой replica set `rs0` — нужен для транзакций очереди), API на Node.js (systemd), статика Vue за nginx. Переменные API — `backend/.env` (шаблон: `backend/.env.example`).

---

## 1. Требования к VPS

- **ОС:** Ubuntu 22.04 или 24.04 LTS.
- **Ресурсы (минимум):** 2 vCPU, 2 GB RAM, 20 GB SSD. При 2 GB RAM желателен swap (см. раздел 2).
- **Порты у провайдера / security group:** открыть **22** (SSH), **4173** (веб-интерфейс). Порт **4000** — только если нужен прямой доступ к API снаружи (отладка); иначе не открывать.
- **MongoDB (`mongod`):** слушает **только localhost** (`127.0.0.1`), порт **27017** снаружи **не открывать**.

---

## 2. Первичная настройка сервера

Подключитесь по SSH (под `root` или пользователем с `sudo`).

```bash
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban
```

### Пользователь для деплоя

```bash
adduser deploy
usermod -aG sudo deploy
```

Дальше при необходимости перелогиньтесь под `deploy`. Рекомендуется настроить вход по SSH-ключу и при желании отключить вход по паролю для root в `/etc/ssh/sshd_config` (после проверки ключей).

### Часовой пояс

Бизнес-логика (очередь, календарь) ориентирована на московское время:

```bash
sudo timedatectl set-timezone Europe/Moscow
```

### Swap (если RAM ≤ 2 GB)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 4173/tcp
# Опционально, если нужен API снаружи:
# sudo ufw allow 4000/tcp
sudo ufw enable
sudo ufw status
```

Порт **27017** не добавлять.

---

## 4. Node.js, Yarn, MongoDB, nginx

**Node.js 20** (например, через NodeSource или `nvm` — главное, чтобы `node` и `corepack`/`yarn` были доступны пользователю `deploy`).

```bash
# Пример: официальный бинарь или репозиторий NodeSource — см. документацию Node.js
corepack enable
corepack prepare yarn@1.22.22 --activate
```

**MongoDB 7.x** установите по [инструкции MongoDB для Ubuntu](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/). Обязательно настройте **replica set** на одном узле для базы приложения (`lk-daily`):

- В `/etc/mongod.conf` (пути могут отличаться):  
  `replication.replSetName: "rs0"`, привязка `net.bindIp: 127.0.0.1`.
- Запуск: `sudo systemctl enable --now mongod`.
- Инициализация один раз (через `mongosh`):  
  `rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })`.

**nginx:**

```bash
sudo apt install -y nginx
```

---

## 5. Каталог проекта и Git

Рекомендуемый путь: `/opt/lk-daily`.

```bash
sudo mkdir -p /opt/lk-daily
sudo chown deploy:deploy /opt/lk-daily
cd /opt/lk-daily
```

Клонирование:

- **HTTPS:** `git clone <URL_репозитория> .`
- **SSH (deploy key):** настройте ключ на сервере и в репозитории, затем клонируйте по SSH.

Первый деплой (сборки):

```bash
cd /opt/lk-daily/backend && yarn install --frozen-lockfile && yarn build
cd /opt/lk-daily/frontend && yarn install --frozen-lockfile && VITE_API_URL=/api yarn build
```

Каталог статики для nginx: `/opt/lk-daily/frontend/dist`.

---

## 6. Переменные окружения (`backend/.env`)

```bash
cd /opt/lk-daily/backend
cp .env.example .env
nano .env
```

Обязательно задайте (см. `backend/src/config/env.ts` — в **production** API не стартует при небезопасной конфигурации):

| Переменная | Назначение |
|------------|------------|
| `MONGO_URI` | Например `mongodb://127.0.0.1:27017/lk-daily?replicaSet=rs0&directConnection=true` |
| `JWT_SECRET` | Не короче 32 символов; не значение из dev-примеров. Генерация: `openssl rand -hex 32` |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | Нельзя пара `admin` / `admin123` |
| `CORS_ORIGINS` | Через запятую origin фронта. Для доступа по IP: `http://<IP_VPS>:4173,http://127.0.0.1:4173` |

Дополнительно см. закомментированные переменные в `backend/.env.example` (`RATE_LIMIT_*`, webhook).

**Учётная запись админа:** при первом запуске при пустой коллекции `Admin` создаётся пользователь из `ADMIN_*`. Смена пароля только через переменные после первого создания в приложении не реализована — нужна работа с БД или отдельная функция.

---

## 7. systemd: юнит API

Файл `/etc/systemd/system/lk-daily-api.service` (отредактируйте `User=` при необходимости):

```ini
[Unit]
Description=LK Daily API
After=network.target mongod.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/lk-daily/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Если бинарь `node` в другом пути: `which node` и подставьте в `ExecStart`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lk-daily-api
sudo systemctl status lk-daily-api
```

Логи: `journalctl -u lk-daily-api -f`.

---

## 8. nginx (статика + `/api`)

Скопируйте содержимое [frontend/nginx.conf](frontend/nginx.conf) в файл сайта, например `/etc/nginx/sites-available/lk-daily`, поправив пути **`root`** на абсолютный:

```nginx
root /opt/lk-daily/frontend/dist;
```

В том же конфиге `proxy_pass` для `/api/` должен указывать на `http://127.0.0.1:4000/` (backend слушает `PORT` из `.env`, по умолчанию 4000).

```bash
sudo ln -sf /etc/nginx/sites-available/lk-daily /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Проверки:

```bash
curl -sS http://127.0.0.1:4000/health
curl -sI http://127.0.0.1:4173/
```

В браузере: `http://<IP_VPS>:4173/`.

---

## 9. Обновление приложения (вручную)

```bash
cd /opt/lk-daily
git pull
cd backend && yarn install --frozen-lockfile && yarn build
cd ../frontend && yarn install --frozen-lockfile && VITE_API_URL=/api yarn build
sudo systemctl restart lk-daily-api
sudo nginx -t && sudo systemctl reload nginx
```

---

## 10. Резервное копирование MongoDB

```bash
sudo mkdir -p /var/backups/lk-daily
sudo chown deploy:deploy /var/backups/lk-daily
mkdir -p /opt/lk-daily/scripts
```

`/opt/lk-daily/scripts/backup-mongo.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP="$(date +%Y-%m-%d_%H%M)"
URI='mongodb://127.0.0.1:27017/lk-daily?replicaSet=rs0&directConnection=true'
mongodump --uri="$URI" --archive --gzip \
  > "/var/backups/lk-daily/lk-daily-${STAMP}.archive.gz"
find /var/backups/lk-daily -type f -mtime +14 -delete
```

Убедитесь, что пользователь cron может вызывать `mongodump` (обычно пакет `mongodb-database-tools`; при ошибке доступа добавьте в PATH или вызывайте с полным путём).

```bash
chmod +x /opt/lk-daily/scripts/backup-mongo.sh
```

Cron (ежедневно в 03:00):

```cron
0 3 * * * /opt/lk-daily/scripts/backup-mongo.sh >> /var/log/lk-daily-backup.log 2>&1
```

**Восстановление** (осторожно: `--drop` удалит коллекции в БД перед импортом):

```bash
mongorestore --uri="$URI" --archive --gzip --drop < /var/backups/lk-daily/lk-daily-YYYY-MM-DD_HHMM.archive.gz
```

---

## 11. Чеклист безопасности

- [ ] `JWT_SECRET` ≥ 32 символов, не дефолт из dev.
- [ ] `ADMIN_LOGIN` / `ADMIN_PASSWORD` не пара `admin` / `admin123`.
- [ ] `CORS_ORIGINS` задан явно в production.
- [ ] MongoDB только на localhost; порт 27017 не открыт в firewall.
- [ ] Включены `ufw` и `fail2ban`.
- [ ] Регулярно: `sudo apt update && sudo apt upgrade -y`; обновления MongoDB по политике вашей сборки (`apt`, официальный репозиторий).

---

## 12. Траблшутинг

| Симптом | Что проверить |
|---------|----------------|
| API не стартует (`systemctl status`) | Логи `journalctl -u lk-daily-api -n 100` — часто отказ из-за production-проверок: короткий `JWT_SECRET`, дефолтные admin-учётные данные, пустой `CORS_ORIGINS`. |
| Ошибки транзакций MongoDB | Replica set не инициализирован или неверный `MONGO_URI` (`replicaSet`, `directConnection`). |
| 502 на `/api` с фронта | `systemctl status lk-daily-api`, `curl http://127.0.0.1:4000/health`, логи nginx. |
| После смены `backend/.env` | `sudo systemctl restart lk-daily-api`. |

---

## 13. Краткая схема портов

| Порт | Назначение |
|------|------------|
| 4173 | nginx: статика SPA + прокси `/api` → backend |
| 4000 | API (по умолчанию); снаружи только при явном открытии в UFW |
| 27017 | MongoDB на localhost; снаружи не открывать |

---

## 14. HTTPS и reverse proxy

Если есть **домен**, терминируйте TLS на хосте; upstream — nginx на `127.0.0.1:4173` или отдельный vhost с теми же `root` и `location /api/`. Обновите `CORS_ORIGINS` на `https://…`.

---

## 15. Мониторинг

**Жизнь сервиса:** `GET /health` (HTTP 200, `"mongo":"connected"`). Пример cron:

```cron
*/5 * * * * curl -fsS http://127.0.0.1:4000/health >/dev/null || logger -t lk-daily-health "health check failed"
```

**Диск:** следите за `/var/lib/mongodb` (или путём данных вашей установки) и каталогом бэкапов.

**Логи:** structured JSON на stderr процесса Node; доступ HTTP — через morgan. Для централизованного сбора используйте `journald` или агент на хосте.

---

## 16. Вне этого документа

- Автоматический деплой из Git по умолчанию не описан — обновления вручную (раздел 9).
- Детали DNS и алертов — по вашей инфраструктуре.
