# Выкладка LK Daily на VPS (Ubuntu, Docker Compose)

Инструкция для развёртывания без домена и HTTPS: доступ по `http://<IP_VPS>:4173` (фронт), опционально API на порту `4000`. Обновления — вручную (`git pull` + пересборка контейнеров).

Стек в репозитории: `docker-compose.yml` (MongoDB, API на Node.js, статика Vue через nginx). Переменные окружения для compose — корневой `.env` (шаблон: `.env.example`).

---

## 1. Требования к VPS

- **ОС:** Ubuntu 22.04 или 24.04 LTS.
- **Ресурсы (минимум):** 2 vCPU, 2 GB RAM, 20 GB SSD. При 2 GB RAM желательен swap (см. раздел 2).
- **Порты у провайдера / security group:** открыть **22** (SSH), **4173** (веб-интерфейс). Порт **4000** — только если нужен прямой доступ к API снаружи (отладка); иначе не открывать.
- **Порт 27017 (MongoDB):** в `docker-compose.yml` он проброшен на хост (`27017:27017`), по умолчанию слушает все интерфейсы хоста; снаружи порт **не открывать** в firewall — так доступ из интернета к БД перекрыт. Контейнеры по-прежнему ходят в Mongo по имени `mongo:27017`. Для жёсткой привязки только к localhost можно заменить проброс на `127.0.0.1:27017:27017` (правка compose на сервере / override).

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

## 4. Docker и Docker Compose

Официальная установка Docker Engine (пример для Ubuntu):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

Выйдите из сессии и зайдите снова под `deploy`, чтобы подхватилась группа `docker`. Проверка:

```bash
docker --version
docker compose version
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
- **SSH (deploy key):** настройте ключ на сервере и в настройках репозитория, затем `git clone git@github.com:org/lk-daily.git .` (URL замените на свой).

---

## 6. Переменные окружения (`.env`)

```bash
cd /opt/lk-daily
cp .env.example .env
nano .env   # или vim
```

Обязательно задайте (см. также `backend/src/config/env.ts` — в **production** API не стартует при небезопасной конфигурации):

| Переменная | Назначение |
|------------|------------|
| `JWT_SECRET` | Секрет JWT, **не короче 32 символов**, не значение `dev-secret-change-me`. Пример генерации: `openssl rand -hex 32` |
| `ADMIN_LOGIN` | Логин админа. **Нельзя** пара `admin` / `admin123` |
| `ADMIN_PASSWORD` | Надёжный пароль админа |
| `CORS_ORIGINS` | Список origin через запятую. В production **обязателен хотя бы один** origin. Для доступа по IP: `http://<IP_VPS>:4173,http://127.0.0.1:4173` |

Пример строки для доступа только с VPS по IP (подставьте свой IP):

```env
JWT_SECRET=<вывод openssl rand -hex 32>
ADMIN_LOGIN=lk-admin
ADMIN_PASSWORD=<сильный_пароль>
CORS_ORIGINS=http://203.0.113.10:4173,http://127.0.0.1:4173
```

Дополнительные переменные для API (если понадобятся) сейчас **не** проброшены в `docker-compose.yml` для сервиса `api`. Их можно добавить в `docker-compose.override.yml` (не коммитить секреты) или расширить секцию `environment` у `api` и пересобрать. См. `backend/.env.example`: `RATE_LIMIT_*`, `OUTBOUND_WEBHOOK_URL`, `WEBHOOK_TRIGGER_SECRET`.

**Учётная запись админа:** при первом запуске, если коллекция `Admin` в MongoDB пуста, создаётся пользователь из `ADMIN_*`. Смена пароля только через переменные **после** первого создания не подхватывается автоматически — для смены нужна работа с БД или отдельная логика в приложении.

---

## 7. Первый запуск

Из корня репозитория (где лежит `docker-compose.yml`):

```bash
cd /opt/lk-daily
docker compose up -d --build
docker compose ps
```

Проверки на сервере:

```bash
curl -sS http://127.0.0.1:4000/health
curl -sI http://127.0.0.1:4173/
```

В браузере: `http://<IP_VPS>:4173/` — фронт; запросы к `/api` проксируются nginx контейнера `frontend` на сервис `api` (см. `frontend/nginx.conf`).

---

## 8. Логи и повседневные операции

```bash
cd /opt/lk-daily
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f mongo
```

Перезапуск одного сервиса:

```bash
docker compose restart api
```

Остановка без удаления тома с данными MongoDB:

```bash
docker compose down
```

Том `mongo_data` сохраняется; данные БД не пропадают при `down`.

---

## 9. Обновление приложения (вручную)

Обычный цикл (пересборка образов при необходимости):

```bash
cd /opt/lk-daily
git pull
docker compose up -d --build
docker image prune -f
```

Если подозреваете устаревший код из кэша слоёв Docker, пересоберите без кэша: `docker compose build --no-cache` и затем `docker compose up -d`.

---

## 10. Резервное копирование MongoDB

Создайте каталог для бэкапов и скрипт (один раз, под `deploy` или с `sudo` для `/var/backups`):

```bash
sudo mkdir -p /var/backups/lk-daily
sudo chown deploy:deploy /var/backups/lk-daily
mkdir -p /opt/lk-daily/scripts
```

Файл `/opt/lk-daily/scripts/backup-mongo.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/lk-daily
STAMP="$(date +%Y-%m-%d_%H%M)"
docker compose exec -T mongo mongodump --archive --gzip --db=lk-daily \
  > "/var/backups/lk-daily/lk-daily-${STAMP}.archive.gz"
find /var/backups/lk-daily -type f -mtime +14 -delete
```

```bash
chmod +x /opt/lk-daily/scripts/backup-mongo.sh
```

Cron (ежедневно в 03:00 по времени сервера):

```bash
crontab -e
```

Строка:

```cron
0 3 * * * /opt/lk-daily/scripts/backup-mongo.sh >> /var/log/lk-daily-backup.log 2>&1
```

**Восстановление** из файла на хосте (подставьте путь к архиву):

```bash
cd /opt/lk-daily
cat /var/backups/lk-daily/lk-daily-YYYY-MM-DD_HHMM.archive.gz | \
  docker compose exec -T mongo mongorestore --archive --gzip --drop
```

Осторожно: `--drop` удалит текущие коллекции в базе `lk-daily` перед импортом.

---

## 11. Чеклист безопасности

- [ ] `JWT_SECRET` ≥ 32 символов, не дефолт из dev.
- [ ] `ADMIN_LOGIN` / `ADMIN_PASSWORD` не пара `admin` / `admin123`.
- [ ] `CORS_ORIGINS` задан явно (не пустой список в production).
- [ ] Порт MongoDB **27017** не открыт в firewall и у провайдера.
- [ ] Включены `ufw` и `fail2ban` для SSH.
- [ ] Регулярно: `sudo apt update && sudo apt upgrade -y`, при необходимости обновление образа `mongo:7` (`docker compose pull` при смене тега в compose).

---

## 12. Траблшутинг

| Симптом | Что проверить |
|---------|----------------|
| Контейнер `api` постоянно перезапускается | `docker compose logs api` — часто отказ из-за production-проверок: короткий `JWT_SECRET`, дефолтные admin-учётные данные, пустой `CORS_ORIGINS`. |
| 502 / таймаут на `/api` с фронта | `docker compose ps` — healthy ли `mongo` и `api`; логи `mongo` и `api`. |
| Нет места на диске | `docker system df`; `docker image prune -af` (осторожно); размер `/var/lib/docker` и тома `mongo_data`. |
| После смены `.env` не подхватилось | Пересоздать контейнер API: `docker compose up -d --force-recreate api` (переменные задаются при создании контейнера). |

Проверка API снаружи (если открыт порт 4000):

```bash
curl -sS "http://<IP_VPS>:4000/health"
```

---

## 13. Краткая схема портов

| Порт | Назначение |
|------|------------|
| 4173 | Веб (nginx + SPA), прокси `/api` → backend |
| 4000 | API напрямую (опционально снаружи) |
| 27017 | MongoDB: проброс на хост в compose; снаружи не открывать; API и другие контейнеры — через `mongo:27017` |

В текущем `docker-compose.yml` Mongo запускается как **одноузловой replica set `rs0`** (требование транзакций при операциях очереди). Строка `MONGO_URI` у сервиса `api` содержит `replicaSet=rs0`.

---

## 14. HTTPS и reverse proxy (рекомендуется для доступа из интернета)

Без домена достаточно HTTP по IP (раздел 7). Если есть **домен**, выдайте сертификат и терминируйте TLS на хосте; upstream остаётся текущий стек Compose (фронт `:4173`, опционально API `:4000` только локально).

**Вариант A — Caddy (авто Let’s Encrypt):** установите Caddy, укажите сайт с `reverse_proxy 127.0.0.1:4173`; задайте переменные окружения API и фронта через тот же `.env`, что и для Compose; обновите `CORS_ORIGINS` на `https://ваш-домен`.

**Вариант B — nginx + Certbot:** виртуальный хост на `443` с `proxy_pass http://127.0.0.1:4173`, сертификаты из `/etc/letsencrypt/live/...`; для `/api` можно проксировать на `127.0.0.1:4173` (как в контейнере фронта) или напрямую на `127.0.0.1:4000` при согласовании CORS и путей.

После включения HTTPS добавьте в `CORS_ORIGINS` именно `https://…`, без смешивания с HTTP того же хоста в production.

---

## 15. Мониторинг и алерты

**Жизнь сервиса:** опросите `GET /health` (ожидается HTTP `200`, тело с `"ok":true` и `"mongo":"connected"`). При `503` или недоступности хоста — алерт оператору.

Примеры:

- Внешний мониторинг (Uptime Kuma, Pingdom, Grafana Cloud и т.п.) с проверкой URL раз в 1–5 минут.
- Локальный cron на VPS:

```cron
*/5 * * * * curl -fsS http://127.0.0.1:4000/health >/dev/null || logger -t lk-daily-health "health check failed"
```

Дополнительно можно собирать `GET /metrics` для Prometheus-совместимых систем.

**Диск MongoDB:** следите за заполнением тома (`docker system df`, размер volume `mongo_data`), см. раздел 10.

**Логи приложения:** Winston пишет структурированные сообщения в JSON на stderr контейнера `api`; HTTP access — отдельно через morgan (в production включён `request-id`). При централизованном сборе логов парсьте JSON и коррелируйте по полю `requestId` из access-лога.

---

## 16. Привязка MongoDB только к localhost (опционально)

В [docker-compose.yml](docker-compose.yml) порт Mongo проброшен как `27017:27017` на все интерфейсы хоста. На VPS безопаснее не открывать порт наружу (раздел 3) и при желании пробрасывать только loopback, чтобы даже LAN не видел БД:

```yaml
services:
  mongo:
    ports:
      - '127.0.0.1:27017:27017'
```

Вынесите переопределение в `docker-compose.override.yml` на сервере или поправьте compose для продакшена осознанно. Контейнеры (`api`, др.) по-прежнему подключаются по имени `mongo:27017`.

---

## 17. Что по-прежнему вне этого документа

- CI/CD автоматом из Git — деплой по умолчанию вручную (раздел 9).
- Детальная настройка конкретного провайдера DNS и почты для алертов.
