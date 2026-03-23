# MyHouse

Project from Faculty of maths and IT MRSU for Accelerator "OgarevPRO"

---

REST API для MyHouse на базе Docker (PostgreSQL + TimescaleDB + Redis + Node.js).

## 🚀 Быстрый старт

**Требования:** Docker 20.10+, Docker Compose 2.0+

```bash
git clone https://github.com/your-username/MyHouse.git
cd MyHouse
docker-compose up -d
```

Проверка: `curl http://localhost:3000/health`

## 📦 Сервисы

| Сервис | Порт | Описание |
|--------|------|---------|
| PostgreSQL + TimescaleDB | 5432 | База данных |
| Redis | 6379 | Кеш |
| Backend API | 3000 | REST API |

## 📡 API

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
BACKEND_PORT=3000
```
