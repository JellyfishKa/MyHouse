# Деплой MyHouse: Railway + Vercel

Пошаговая инструкция для публикации демо-сайта со стресс-тестом.  
Архитектура: **бэкенд и БД на Railway**, **фронтенд на Vercel**, один URL для QR-кода.

```
Эксперт → QR → https://myhouse.vercel.app
                      │
                      ├─ /           → React (Vercel)
                      └─ /api/*      → rewrite → Railway FastAPI
```

---

## Часть A. Что запланировать и сделать ДО публикации

Не начинайте деплой, пока не закрыты пункты ниже.

### A.1. Аккаунты и доступы

| Что | Зачем |
|-----|--------|
| [GitHub](https://github.com) | Репозиторий MyHouse (public или private с доступом для Railway/Vercel) |
| [Railway](https://railway.app) | Backend, ML, TimescaleDB |
| [Vercel](https://vercel.com) | Frontend |
| Банковская карта | Railway привязывает карту даже на trial (~$5 кредитов/мес) |

Подключите GitHub к Railway и Vercel заранее (Settings → Connect GitHub).

---

### A.2. Критично: база данных — только TimescaleDB

Проект **не работает** на обычном PostgreSQL: миграции Alembic вызывают `create_hypertable()`.

**Не используйте** шаблон «Add PostgreSQL» в Railway.

**Выберите один вариант:**

| Вариант | Плюсы | Минусы |
|---------|--------|--------|
| **TimescaleDB как Docker-сервис на Railway** | Всё в одном месте | Нужен volume, ~$3–5/мес после исчерпания кредитов |
| **[Timescale Cloud](https://www.timescale.com/)** (free tier) | Managed, не надо админить | Отдельный сервис, лимиты |

Запланируйте: имя сервиса БД, пароль (генератор: 24+ символов), куда сохраните connection string.

---

### A.3. Изменения в коде (сделать локально, закоммитить)

Перед первым деплоем подготовьте коммит с:

#### 1. `vercel.json` в корне репозитория

Файл уже добавлен в репозиторий. После деплоя backend на Railway замените placeholder URL на реальный и сделайте redeploy Vercel.

#### 2. Переменная сборки фронта

В Vercel: `VITE_API_URL=/api/v1`  
(относительный путь — запросы идут через rewrite, CORS не нужен)

#### 3. (Опционально) CORS в `backend/app/main.py`

Нужен **только если** фронт ходит на backend напрямую, без rewrite.  
При схеме через `vercel.json` — **не трогать**.

#### 4. Railway: пути к Dockerfile

Убедитесь, что Railway собирает:

- **backend** → `backend/Dockerfile`, root directory `backend`
- **ml** → `ml/Dockerfile`, root directory `ml`

Redis из `docker-compose.yml` **не нужен** — FastAPI его не использует.

---

### A.4. Бюджет и лимиты

| Сервис | Ожидание |
|--------|----------|
| Vercel Hobby | **$0**, достаточно для демо |
| Railway | ~$5 кредитов/мес бесплатно, потом pay-as-you-go |
| 3 сервиса Railway (DB + backend + ml) | ~$5–15/мес при постоянной работе |

**Для экономии:** ML-сервис можно не поднимать — стресс-тест работает без него.  
Без ML: кнопка «ML-анализ» и индикатор ML будут offline.

---

### A.5. Демо-данные — план seed

`infra/seed.py` завязан на `docker exec` — **на Railway не работает**.

План для облака:

1. **Объект + сенсоры** — `POST /api/v1/objects/register` (curl, см. часть B)
2. **Оборудование + readings** — `scripts/seed_demo.py` с `API_URL=https://ВАШ-RAILWAY-URL/api/v1`

Проверьте локально, что после seed на Dashboard есть объект и кнопка «Стресс-тест» активна.

---

### A.6. Безопасность (демо для экспертов)

- [ ] Сменить дефолтные пароли (`postgres`, `redis`) — сгенерировать новые
- [ ] Понимать: **авторизации нет** — любой с URL может дернуть API
- [ ] Не хранить секреты в git — только env в Railway/Vercel
- [ ] Не коммитить `.env`

---

### A.7. Чеклист «готов к деплою»

- [ ] Репозиторий на GitHub актуален
- [ ] `vercel.json` добавлен (URL backend — placeholder или финальный)
- [ ] Решено: TimescaleDB на Railway **или** Timescale Cloud
- [ ] Решено: деплоить ML или нет
- [ ] Пароли сгенерированы и записаны в менеджер паролей
- [ ] Локально `docker compose up` + стресс-тест проходят
- [ ] Есть план seed через API

---

## Часть B. Поэтапный деплой

### Этап 0. Локальная проверка

```bash
git clone https://github.com/JellyfishKa/MyHouse.git
cd MyHouse
cp .env.example .env
docker compose up -d --build
```

Seed локально (Docker):

```bash
python infra/seed.py
python scripts/seed_demo.py
```

Открыть http://localhost:3000 → Dashboard → «Стресс-тест» (~5 мин).

---

### Этап 1. TimescaleDB на Railway

1. [railway.app/new](https://railway.app/new) → **Empty Project**
2. **+ New** → **Docker Image**
3. Image: `timescale/timescaledb:latest-pg16`
4. Variables:

   | Variable | Value |
   |----------|--------|
   | `POSTGRES_USER` | `postgres` |
   | `POSTGRES_PASSWORD` | `<сильный пароль>` |
   | `POSTGRES_DB` | `myhouse` |

5. **Volume** → mount `/var/lib/postgresql/data` (иначе данные пропадут при рестарте)
6. **Networking** → включить **Private Networking**
7. Deploy → дождаться Running
8. Записать **Private URL** (например `timescaledb.railway.internal`) и порт `5432`

> **Альтернатива:** Timescale Cloud → скопировать connection string → в backend задать `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

---

### Этап 2. Backend (FastAPI) на Railway

1. В том же проекте: **+ New** → **GitHub Repo** → MyHouse
2. Settings сервиса:
   - **Root Directory:** `backend`
   - **Builder:** Dockerfile
3. **Variables:**

   | Variable | Value |
   |----------|--------|
   | `DB_HOST` | Private hostname TimescaleDB (из Railway) |
   | `DB_PORT` | `5432` |
   | `DB_USER` | `postgres` |
   | `DB_PASSWORD` | как в TimescaleDB |
   | `DB_NAME` | `myhouse` |
   | `ML_SERVICE_URL` | `http://ml.railway.internal:8002` (если ML есть) |
   | `NODE_ENV` | `production` |

4. **Networking** → **Generate Domain** → публичный URL, например:  
   `https://myhouse-backend-production.up.railway.app`
5. Deploy → в логах: `alembic upgrade head` + `uvicorn` без ошибок
6. Проверка:

   ```bash
   curl https://ВАШ-BACKEND.up.railway.app/health
   curl https://ВАШ-BACKEND.up.railway.app/api/v1/healthcheck
   ```

7. **Обновите `vercel.json`:** замените placeholder URL на реальный Railway domain и redeploy Vercel.

---

### Этап 3. ML-сервис (опционально)

1. **+ New** → GitHub → MyHouse
2. **Root Directory:** `ml`
3. Variables — те же `DB_*`, что у backend
4. Private networking, порт **8002**
5. В backend обновить `ML_SERVICE_URL` на private URL ML-сервиса
6. Redeploy backend

Без ML — пропустить; стресс-тест всё равно работает.

---

### Этап 4. Seed данных в облаке

#### 4.1. Объект и сенсоры

```bash
curl -X POST "https://ВАШ-BACKEND.up.railway.app/api/v1/objects/register" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "name": "Датацентр МГУ",
    "type": "datacenter",
    "meta_data": {"source": "seed"},
    "sensors": [
      {"id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "type": "electricity", "category": "servers",   "label": "Серверы",    "unit": "Вт"},
      {"id": "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "type": "electricity", "category": "cooling",   "label": "Охлаждение", "unit": "Вт"},
      {"id": "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "type": "electricity", "category": "ups",       "label": "ИБП",        "unit": "Вт"},
      {"id": "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "type": "electricity", "category": "lighting",  "label": "Освещение",  "unit": "Вт"}
    ]
  }'
```

#### 4.2. Оборудование и история readings

```powershell
# Windows PowerShell
$env:API_URL="https://ВАШ-BACKEND.up.railway.app/api/v1"
python scripts/seed_demo.py
```

```bash
# Linux / macOS
API_URL=https://ВАШ-BACKEND.up.railway.app/api/v1 python scripts/seed_demo.py
```

#### 4.3. Проверка

```bash
curl https://ВАШ-BACKEND.up.railway.app/api/v1/objects

curl -X POST https://ВАШ-BACKEND.up.railway.app/api/v1/demo/stress-test \
  -H "Content-Type: application/json" \
  -d '{"object_id": "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "duration_seconds": 60}'
```

---

### Этап 5. Frontend на Vercel

1. [vercel.com/new](https://vercel.com/new) → Import GitHub → MyHouse
2. **Framework Preset:** Vite
3. **Root Directory:** `.` (корень)
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Environment Variables:**

   | Name | Value |
   |------|--------|
   | `VITE_API_URL` | `/api/v1` |

7. В `vercel.json` подставить реальный Railway backend URL в `destination`
8. **Deploy**
9. URL: `https://myhouse-xxxxx.vercel.app`

#### Проверка Vercel

- [ ] Главная открывается
- [ ] Dashboard показывает «Датацентр МГУ»
- [ ] «Стресс-тест» запускается, графики обновляются
- [ ] DevTools → Network: запросы на `/api/v1/...` (same-origin, без CORS-ошибок)

---

### Этап 6. QR-код для экспертов

1. Финальный URL: `https://ваш-проект.vercel.app`
2. Проверка с **мобильного интернета** (не только Wi‑Fi)
3. QR: [goqr.me](https://goqr.me/) или вставка в PDF/презентацию
4. Короткая инструкция для экспертов:

   > Откройте сайт → Dashboard → выберите «Датацентр МГУ» → «Стресс-тест».  
   > Наблюдайте деградацию ~5 минут.

---

### Этап 7. (Опционально) Свой домен

**Vercel:** Project → Settings → Domains → добавить `demo.myhouse.ru`  
**DNS:** CNAME `@` или `demo` → `cname.vercel-dns.com`

---

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Backend падает при старте | Логи Railway → ошибка Alembic / `create_hypertable` → не TimescaleDB |
| `502` на `/api/*` | Backend не Running; неверный URL в `vercel.json` |
| Пустой Dashboard | Не выполнен seed (этап 4) |
| CORS в браузере | Фронт бьёт напрямую в Railway — используйте rewrite в `vercel.json` |
| Стресс-тест обрывается | Проверить логи backend; на Railway Docker timeout обычно не мешает |
| ML offline | ML не задеплоен или неверный `ML_SERVICE_URL` — для демо стресс-теста не критично |
| Закончились Railway credits | Остановить ML, уменьшить сервисы или пополнить баланс |

---

## Порядок действий (кратко)

```
1. Подготовка (Часть A) — код, аккаунты, TimescaleDB-план
2. Railway: TimescaleDB
3. Railway: backend (+ ml опционально)
4. Seed через API
5. Vercel: frontend + vercel.json (обновить Railway URL)
6. Проверка стресс-теста
7. QR-код
```

---

## Полезные ссылки

- [Railway Docs](https://docs.railway.app/)
- [Vercel Rewrites](https://vercel.com/docs/projects/project-configuration#rewrites)
- [TimescaleDB Docker](https://hub.docker.com/r/timescale/timescaledb)
- Swagger backend: `https://ВАШ-BACKEND.up.railway.app/docs`
