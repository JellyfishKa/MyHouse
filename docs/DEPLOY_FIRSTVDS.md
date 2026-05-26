# Деплой MyHouse на FirstVDS (Docker + DuckDNS)

Пошаговая инструкция для публикации демо-сайта со стресс-тестом и ML на **одном VDS**.  
Архитектура: все сервисы в Docker, HTTPS через Caddy, бесплатный поддомен DuckDNS.

```
Эксперт → QR → https://pulsetok.duckdns.org
                      │
                      ├─ Caddy :443 (Let's Encrypt)
                      └─ frontend nginx :80
                             ├─ /           → React SPA
                             └─ /api/*      → FastAPI backend
                                    ├─ TimescaleDB
                                    └─ ML service
```

**Минимальные ресурсы VDS:** 2 vCPU, **4 ГБ RAM**, 20+ ГБ SSD, Ubuntu 22.04.

Альтернатива (облако без VDS): [DEPLOY_RAILWAY_VERCEL.md](DEPLOY_RAILWAY_VERCEL.md).

**Сервер проекта PulseTok:**

| Параметр | Значение |
|----------|----------|
| IP VDS | `83.136.233.93` |
| Домен | `https://pulsetok.duckdns.org` |
| DuckDNS | поддомен `pulsetok` → IP `83.136.233.93` |

---

## Часть A. Что сделать ДО деплоя

### A.1. Аккаунты и доступы

| Что | Зачем |
|-----|--------|
| [FirstVDS](https://firstvds.ru/) | VPS с публичным IP |
| [DuckDNS](https://www.duckdns.org/) | Бесплатный поддомен `*.duckdns.org` + HTTPS |
| [GitHub](https://github.com) | Клонирование репозитория на сервер |

### A.2. Критично: только TimescaleDB

Проект **не работает** на обычном PostgreSQL — миграции Alembic вызывают `create_hypertable()`.  
В `docker-compose.yml` уже используется образ `timescale/timescaledb:latest-pg16`.

### A.3. Пароли и `.env`

На сервере создайте `.env` из шаблона:

```bash
cp .env.example .env
nano .env
```

Обязательно задайте:

| Переменная | Пример | Описание |
|------------|--------|----------|
| `DOMAIN` | `pulsetok.duckdns.org` | Поддомен DuckDNS |
| `DB_PASSWORD` | `<24+ символов>` | Пароль TimescaleDB |
| `CORS_ORIGINS` | `https://pulsetok.duckdns.org` | Origin фронта |

**Не коммитьте `.env` в git.**

Redis в production **не нужен** — FastAPI его не использует. Сервис redis запускается только с `--profile dev`.

### A.4. Чеклист «готов к деплою»

- [ ] VDS создан, есть root/SSH-доступ
- [ ] Поддомен DuckDNS указывает на IP сервера
- [ ] Пароли сгенерированы
- [ ] Локально `docker compose up` + стресс-тест проходят
- [ ] Порты 80 и 443 открыты (ufw / панель FirstVDS)

---

## Часть B. Подготовка сервера

### B.1. Подключение по SSH

```bash
ssh root@ВАШ_IP
```

### B.2. Установка Docker

```bash
apt update && apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
docker compose version
```

### B.3. Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

### B.4. DuckDNS

1. Зарегистрируйтесь на [duckdns.org](https://www.duckdns.org/)
2. Создайте поддомен, например `myhouse` → `pulsetok.duckdns.org`
3. Укажите **Current IP** = IP вашего VDS
4. Проверка (с локальной машины):

```bash
nslookup pulsetok.duckdns.org
```

Должен вернуть IP сервера. Подождите 1–5 минут после смены IP.

---

## Часть C. Деплой приложения

### C.1. Клонирование и настройка

```bash
cd /opt
git clone https://github.com/JellyfishKa/MyHouse.git
cd MyHouse
cp .env.example .env
nano .env   # DOMAIN, DB_PASSWORD, CORS_ORIGINS
```

### C.2. Запуск production stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Первый запуск занимает 5–15 минут (сборка образов, Alembic-миграции).

### C.3. Проверка логов

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

В логах backend: `alembic upgrade head` без ошибок, затем `uvicorn`.

### C.4. Health checks

```bash
curl -s https://pulsetok.duckdns.org/health
curl -s https://pulsetok.duckdns.org/api/v1/healthcheck
curl -s https://pulsetok.duckdns.org/api/v1/ml/health
```

Ожидаемо:
- `/health` → `{"status":"ok"}`
- `/api/v1/healthcheck` → БД connected
- `/api/v1/ml/health` → `"status":"ok"`

> Caddy автоматически получит Let's Encrypt-сертификат при первом запросе на порт 80. Если сертификат не выдаётся — проверьте DNS и что порт 80 доступен из интернета.

---

## Часть D. Seed демо-данных

На сервере (из каталога проекта):

```bash
chmod +x scripts/seed_production.sh
DOMAIN=pulsetok.duckdns.org ./scripts/seed_production.sh
```

Или явно с URL:

```bash
./scripts/seed_production.sh https://pulsetok.duckdns.org
```

**Быстрый seed (3 дня)** — если полный 7-дневный прогон слишком долгий:

```bash
API_URL=https://pulsetok.duckdns.org/api/v1 python3 scripts/seed_demo.py --days 3
```

> Backend на production **не** слушает `localhost:8000` с хоста — всегда указывайте публичный URL через `API_URL` или `DOMAIN` в `seed_production.sh`.

Скрипт:
1. Регистрирует объект «Датацентр МГУ» и 4 сенсора через API
2. Создаёт оборудование и историю readings (по умолчанию 7 дней, `--days 3` для быстрого варианта)

Проверка:

```bash
curl -s https://pulsetok.duckdns.org/api/v1/objects | python3 -m json.tool
```

---

## Часть E. Проверка демо

Откройте `https://pulsetok.duckdns.org` в браузере:

- [ ] Dashboard показывает «Датацентр МГУ»
- [ ] Индикатор **ML доступен** (зелёный)
- [ ] Кнопка **Стресс-тест** активна → графики обновляются ~5 мин
- [ ] Кнопка **ML-анализ** завершается без ошибки 503
- [ ] DevTools → Network: запросы на `/api/v1/...` (same-origin)

Проверьте с **мобильного интернета** (не только Wi‑Fi).

---

## Часть F. QR-код для экспертов

1. Финальный URL: `https://pulsetok.duckdns.org`
2. QR: [goqr.me](https://goqr.me/) или вставка в PDF/презентацию
3. Инструкция для экспертов:

   > Откройте сайт → Dashboard → «Датацентр МГУ» → «Стресс-тест».  
   > Наблюдайте деградацию ~5 минут. Затем нажмите «ML-анализ».

---

## Часть G. Обновление и перезапуск

```bash
cd /opt/MyHouse
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Только backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend
```

---

## Часть H. Резервное копирование БД

```bash
mkdir -p /opt/backups
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres myhouse > /opt/backups/myhouse-$(date +%Y%m%d).sql
```

Восстановление:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres myhouse < /opt/backups/myhouse-YYYYMMDD.sql
```

Cron (ежедневно в 3:00):

```cron
0 3 * * * cd /opt/MyHouse && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres myhouse > /opt/backups/myhouse-$(date +\%Y\%m\%d).sql
```

---

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Backend падает при старте | `docker compose ... logs backend` → ошибка Alembic / `create_hypertable` → не TimescaleDB |
| `502` / сайт не открывается | `docker compose ... ps` — все контейнеры Up; проверьте `DOMAIN` в `.env` и Caddy-логи |
| Нет HTTPS / certificate error | DuckDNS IP ≠ IP сервера; порт 80 закрыт; подождите 5 мин после смены DNS |
| Caddy: `lookup ... on 127.0.0.53:53: connection refused` | DNS внутри Docker: см. раздел ниже |
| Пустой Dashboard | Не выполнен seed (часть D) |
| ML offline | `docker compose ... logs ml`; проверьте RAM (нужно ~4 ГБ) |
| CORS в браузере | Добавьте URL в `CORS_ORIGINS` в `.env`, перезапустите backend |
| Стресс-тест обрывается | Логи backend; проверьте что seed создал equipment |

### DNS внутри Docker (Caddy / Let's Encrypt)

Если в логах Caddy: `lookup acme-v02.api.letsencrypt.org on 127.0.0.53:53: connection refused` — контейнер не может резолвить DNS через systemd-resolved хоста.

**Быстрый фикс на сервере:**

```bash
# 1. DNS для всех контейнеров Docker
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "dns": ["8.8.8.8", "1.1.1.1"]
}
EOF
systemctl restart docker

# 2. Пересоздать стек
cd /opt/MyHouse
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate
```

Проверка DNS из контейнера:

```bash
docker exec myhouse-caddy wget -qO- https://acme-v02.api.letsencrypt.org/directory | head -c 80
curl -s http://127.0.0.1/health
curl -s https://pulsetok.duckdns.org/health
```

---

## Порядок действий (кратко)

```
1. VDS + Docker + ufw
2. DuckDNS → IP сервера
3. git clone, .env, docker compose prod up --build
4. seed_production.sh
5. Проверка Dashboard + стресс-тест + ML
6. QR-код
```

---

## Полезные ссылки

- [FirstVDS база знаний](https://firstvds.ru/technology/)
- [DuckDNS](https://www.duckdns.org/)
- [Caddy документация](https://caddyserver.com/docs/)
- [TimescaleDB Docker](https://hub.docker.com/r/timescale/timescaledb)
- Swagger: `https://pulsetok.duckdns.org/docs`
