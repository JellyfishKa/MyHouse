# MyHouse

Project from Faculty of maths and IT MRSU for Accelerator "OgarevPRO"

---

REST API для управления умным домом на базе Docker (PostgreSQL + TimescaleDB + Redis + Node.js).

## 🚀 Быстрый старт

**Требования:** Docker 20.10+, Docker Compose 2.0+

```bash
git clone https://github.com/your-username/MyHouse.git
cd MyHouse
docker-compose up -d
```

Проверка: `curl http://localhost:8000/health`

Документация API: http://localhost:8000/docs

## 📦 Сервисы

| Сервис | Порт | Описание |
|--------|------|---------|
| PostgreSQL + TimescaleDB | 5432 | База данных |
| Redis | 6379 | Кеш |
| Backend API | 8000 | REST API + Swagger UI (/docs) |

## 📡 API

Полная документация доступна на **http://localhost:8000/docs** (Swagger UI)

```bash
# Статус системы
GET /health

# Тест БД
GET /api/test

# Сохранить в кеш
POST /api/cache
{ "key": "my_key", "value": "my_value" }

# Получить из кеша
GET /api/cache/my_key
```

## 📚 Документация

- [DOCKER_SETUP.md](DOCKER_SETUP.md) — Полная инструкция
- [LICENSE](LICENSE) — ISC лицензия

## 🔧 Команды

```bash
# Логи
docker-compose logs -f

# Подключение к БД
docker-compose exec postgres psql -U postgres -d myhouse

# Подключение к Redis
docker-compose exec redis redis-cli
```

## ⚙️ Переменные (.env)

```env
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=myhouse
REDIS_PASSWORD=redis
NODE_ENV=development
BACKEND_PORT=8000
```