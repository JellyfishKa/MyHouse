# MyHouse Backend - Полная настройка Docker

Этот документ описывает полную инструкцию по запуску проекта с использованием Docker Compose для локальной разработки, тестирования и production deployment.

## Структура проекта

```
.
├── docker-compose.yml          # Основной конфигурационный файл Docker Compose
├── .env                        # Переменные окружения для всех сервисов
├── init-db.sql                 # SQL скрипт инициализации базы данных
├── DOCKER_SETUP.md             # Этот файл с полной документацией
└── backend/
    ├── Dockerfile              # Dockerfile для сборки backend контейнера
    ├── package.json            # Зависимости Node.js
    ├── index.js                # Основное приложение Express
    ├── .env                    # Переменные окружения для backend
    ├── .dockerignore           # Файлы, игнорируемые при сборке образа
    └── .gitignore             # Файлы, игнорируемые при коммитах в Git
```

## Архитектура сервисов

### 1️⃣ PostgreSQL + TimescaleDB
**Назначение:** Основная база данных для хранения структурированных данных и временных рядов

- **Порт:** 5432
- **Пользователь:** postgres
- **Пароль:** postgres (для разработки)
- **База данных:** myhouse
- **Хранилище:** postgres_data (сохранение данных между перезагрузками)
- **Особенности:**
  - TimescaleDB включен для оптимизации и анализа временных рядов
  - Автоматическая инициализация таблиц через init-db.sql
  - Health check каждые 10 секунд для проверки доступности
  - Гарантированное сохранение данных в volume

### 2️⃣ Redis
**Назначение:** Высокоскоростное хранилище для кеширования, сессий и очередей сообщений

- **Порт:** 6379
- **Пароль:** redis (для разработки)
- **Хранилище:** redis_data (кеш)
- **Особенности:**
  - Защита паролем для безопасности
  - Health check для проверки доступности
  - Автоматическое восстановление при перезагрузке контейнера
  - Используется для кеширования часто запрашиваемых данных

### 3️⃣ Backend (Node.js + Express)
**Назначение:** REST API приложение, которое подключается к БД и Redis

- **Порт:** 3000
- **Окружение:** development
- **Особенности:**
  - Автоматически ждёт, пока БД и Redis станут здоровы перед стартом
  - CORS включен для кросс-доменных запросов с frontend приложений
  - Логирование всех HTTP запросов через morgan
  - Hot reload при изменении файлов (в режиме разработки)
  - Использует многоэтапную сборку (multi-stage build) для минимизации размера образа

## ⚡ Быстрый старт

### Системные требования
- **Docker Engine** 20.10 или выше
- **Docker Compose** 2.0 или выше
- **Оперативная память:** 2+ ГБ
- **Свободное место:** 500 МБ для образов и данных

### 🚀 Установка и запуск

#### 1️⃣ Запуск всех контейнеров
```bash
# Запустить в фоновом режиме
docker-compose up -d

# Запустить с выводом логов в консоль
docker-compose up

# Пересобрать образы перед запуском
docker-compose up -d --build
```

#### 2️⃣ Проверка статуса
```bash
# Просмотр работающих контейнеров
docker-compose ps

# ✅ Ожидаемый результат:
# NAME                     COMMAND                   STATE      PORTS
# myhouse-postgres         postgres                  Up         0.0.0.0:5432->5432/tcp
# myhouse-redis            redis-server              Up         0.0.0.0:6379->6379/tcp
# myhouse-backend          node index.js             Up         0.0.0.0:3000->3000/tcp
```

#### 3️⃣ Просмотр логов
```bash
# Все логи (последние 50 строк)
docker-compose logs --tail=50

# Логи одного сервиса
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f backend

# Следить за новыми логами в реальном времени (Ctrl+C для выхода)
docker-compose logs -f
```

## ✅ Тестирование подключений

### Проверка статуса Backend

**Health Check эндпоинт:**
```bash
curl http://localhost:3000/health
```

**✅ Ожидаемый ответ:**
```json
{
  "status": "ok",
  "timestamp": "2024-03-23T12:30:45.123Z",
  "database": "connected",
  "redis": "connected"
}
```

### Подключение к PostgreSQL
```bash
# Вариант 1: Через docker-compose (внутри контейнера)
docker-compose exec postgres psql -U postgres -d myhouse

# Вариант 2: Через локальный клиент (если установлен psql)
psql -h localhost -U postgres -d myhouse

# Ввести пароль: postgres
```

**Полезные SQL команды:**
```sql
-- Просмотр всех таблиц
\dt

-- Просмотр версии PostgreSQL и TimescaleDB
SELECT VERSION();

-- Просмотр таблицы пользователей
SELECT * FROM users;

-- Просмотр событий (временных рядов)
SELECT * FROM events ORDER BY time DESC LIMIT 10;

-- Получить количество событий за день
SELECT DATE(time), COUNT(*) as events_count 
FROM events 
GROUP BY DATE(time);

-- Выход из psql
\q
```

### Подключение к Redis
```bash
# Через docker-compose
docker-compose exec redis redis-cli

# Введите пароль: redis
> AUTH redis

# Полезные команды Redis
> PING                    # Проверка соединения
> SET key value           # Сохранить значение
> GET key                 # Получить значение
> KEYS *                  # Просмотр всех ключей
> TTL key                 # Время жизни ключа в секундах
> FLUSHDB                 # Очистить текущую базу
> QUIT                    # Выход
```

## 📡 API Endpoints

### 1. Проверка здоровья системы
```bash
GET /health
```
**Назначение:** Проверить статус всех компонентов (БД, Redis, API)

### 2. Тест подключения к БД
```bash
GET /api/test
```
**Ответ:** Версия PostgreSQL и информация о подключении

### 3. Сохранение данных в Redis
```bash
POST /api/cache
Content-Type: application/json

{
  "key": "my_key",
  "value": "my_value"
}
```

### 4. Получение данных из Redis
```bash
GET /api/cache/my_key
```

## ⚙️ Переменные окружения

### Корневой .env (для docker-compose)
```env
# PostgreSQL
DB_USER=postgres              # Пользователь БД
DB_PASSWORD=postgres          # Пароль БД
DB_NAME=myhouse               # Имя базы данных
DB_PORT=5432                  # Порт PostgreSQL

# Redis
REDIS_PASSWORD=redis          # Пароль Redis
REDIS_PORT=6379               # Порт Redis

# Backend
NODE_ENV=development          # Окружение (development/production)
BACKEND_PORT=3000             # Порт Backend API
```

### backend/.env (для приложения)
```env
# Окружение приложения
NODE_ENV=development
PORT=3000

# Подключение к PostgreSQL (внутри Docker сети используем имя сервиса)
DB_HOST=postgres              # Имя сервиса PostgreSQL в docker-compose
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=myhouse

# Подключение к Redis
REDIS_HOST=redis              # Имя сервиса Redis в docker-compose
REDIS_PORT=6379
REDIS_PASSWORD=redis
```

## 🎮 Управление контейнерами

### Остановка сервисов
```bash
# Остановить контейнеры (сохраняются volumes/данные)
docker-compose stop

# Остановить и удалить контейнеры
docker-compose down

# ⚠️ Остановить и удалить ВСЁ (включая volumes - ПОТЕРЯ ДАННЫХ!)
docker-compose down -v
```

### Перезагрузка сервиса
```bash
# Перезагрузить один сервис
docker-compose restart backend

# Перезагрузить все сервисы
docker-compose restart
```

### Просмотр использования ресурсов
```bash
# Статистика CPU, памяти, сети для контейнеров
docker stats

# Статистика Docker Compose сервисов
docker-compose stats
```

## 👨‍💻 Разработка приложения

### Структура Backend приложения
```
backend/
├── index.js              # Основной файл (Express приложение)
├── package.json          # Зависимости и скрипты npm
├── Dockerfile            # Инструкции для сборки Docker образа
├── .env                  # Переменные окружения
├── .dockerignore        # Файлы исключаемые из Docker образа
└── .gitignore           # Файлы сохраняемые в Git
```

### Добавление новых зависимостей
```bash
# Установить пакет внутри контейнера
docker-compose exec backend npm install package-name

# Или отредактировать package.json и пересобрать
docker-compose up -d --build backend
```

### Просмотр содержимого контейнера
```bash
# Войти в shell контейнера backend
docker-compose exec backend sh

# Выход из контейнера
exit
```

### Редактирование кода
```bash
# Код находится в backend/ директории
# При изменении файлов в режиме разработки приложение автоматически перезагружается
# (если это настроено в package.json с использованием nodemon)
```

## 💾 Работа с базой данных

### Создание резервной копии
```bash
# Создать dump базы данных
docker-compose exec postgres pg_dump -U postgres myhouse > backup.sql

# Восстановить из backup
docker-compose exec -T postgres psql -U postgres myhouse < backup.sql
```

### Инициализация БД
```bash
# Вручную запустить init-db.sql
docker-compose exec postgres psql -U postgres myhouse < init-db.sql

# Или удалить volume и пересоздать контейнер (новый запуск создаст свежую БД)
docker-compose down -v
docker-compose up -d
```

### Просмотр размера БД
```bash
# Посмотреть размер базы данных
docker-compose exec postgres psql -U postgres myhouse -c "SELECT pg_size_pretty(pg_database_size('myhouse'));"
```

## 🌐 Подключение от Frontend приложения

### JavaScript/TypeScript
```javascript
// Конфигурация API
const API_URL = 'http://localhost:3000';

// Проверка здоровья системы
async function checkHealth() {
  const response = await fetch(`${API_URL}/health`);
  const data = await response.json();
  console.log('Статус системы:', data);
}

// Работа с кешем - сохранение
async function cacheData(key, value) {
  await fetch(`${API_URL}/api/cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value })
  });
}

// Работа с кешем - получение
async function getCachedData(key) {
  const response = await fetch(`${API_URL}/api/cache/${key}`);
  const data = await response.json();
  return data.value;
}
```

### React пример
```jsx
import { useEffect, useState } from 'react';

function App() {
  const [health, setHealth] = useState(null);
  const API_URL = 'http://localhost:3000';

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(r => r.json())
      .then(data => setHealth(data))
      .catch(err => console.error('Ошибка API:', err));
  }, []);

  return (
    <div>
      <h1>Статус Backend</h1>
      {health ? (
        <pre>{JSON.stringify(health, null, 2)}</pre>
      ) : (
        <p>Загрузка...</p>
      )}
    </div>
  );
}

export default App;
```

## 🔧 Решение проблем

### ❌ Ошибка: "Port already in use"
```bash
# Найти процесс, использующий порт (Windows)
netstat -ano | findstr :3000
netstat -ano | findstr :5432
netstat -ano | findstr :6379

# Найти процесс (Linux/Mac)
lsof -i :3000

# Решение 1: Убить процесс
# Windows: taskkill /PID <PID> /F
# Linux/Mac: kill -9 <PID>

# Решение 2: Изменить порты в .env
BACKEND_PORT=3001
DB_PORT=5433
REDIS_PORT=6380
```

### ❌ Ошибка: "backend cannot connect to postgres"
```bash
# Проверить статус всех контейнеров
docker-compose ps

# Просмотреть логи PostgreSQL
docker-compose logs postgres

# Убедиться, что PostgreSQL стартовал успешно
docker-compose logs postgres | grep "ready to accept connections"

# Перезагрузить PostgreSQL
docker-compose restart postgres
```

### ❌ Ошибка: "Redis connection refused"
```bash
# Проверить статус Redis
docker-compose ps redis

# Просмотреть логи Redis
docker-compose logs redis

# Проверить пароль Redis
docker-compose exec redis redis-cli ping
# Если требует пароль: AUTH redis

# Перезагрузить Redis
docker-compose down redis
docker-compose up -d redis
```

### ❌ Backend постоянно перезагружается
```bash
# Просмотреть полный лог ошибок
docker-compose logs backend

# Проверить, доступна ли БД для backend
docker-compose exec backend curl http://postgres:5432

# Проверить переменные окружения
docker-compose exec backend env | grep DB_
```

### ❌ Контейнер не стартует совсем
```bash
# Пересоздать контейнер без использования кеша
docker-compose up -d --build

# Очистить все Docker volume и images
docker-compose down -v
docker system prune -a

# Повторный запуск
docker-compose up -d
```

### ⚠️ Медленное чтение/запись в БД
```bash
# Проверить использование ресурсов
docker stats

# Увеличить памяти для контейнера (в docker-compose.yml)
# Добавить в секцию postgres:
# deploy:
#   resources:
#     limits:
#       memory: 2G
#     reservations:
#       memory: 1G
```

## 🏭 Production deployment

### ⚠️ ВАЖНО: Перед развертыванием в production

1. **Измените пароли на сложные:**
   ```env
   DB_PASSWORD=very_strong_random_password_here_123!@#
   REDIS_PASSWORD=very_strong_random_password_here_456!@#
   ```

2. **Отключите публичные порты (слушаем только локально):**
   ```yaml
   # В docker-compose.yml изменить:
   postgres:
     ports:
       - "127.0.0.1:5432:5432"  # Только локальное подключение
   
   redis:
     ports:
       - "127.0.0.1:6379:6379"
   ```

3. **Добавьте SSL/TLS шифрование:**
   - Используйте nginx reverse proxy
   - Получите сертификат от Let's Encrypt
   - Настройте HTTPS

4. **Мониторинг и логирование:**
   - Настройте Prometheus для сбора метрик
   - Используйте ELK Stack (Elasticsearch, Logstash, Kibana) для централизованного логирования
   - Настройте алерты при критических ошибках

5. **Резервные копии:**
   ```bash
   # Создавать ежедневные резервные копии БД (добавить в cron)
   docker-compose exec postgres pg_dump -U postgres myhouse > backups/backup-$(date +%Y%m%d).sql
   ```

## 📚 Полезные команды

```bash
# Полный пересоздание окружения
docker-compose down -v && docker-compose up -d

# Просмотр всех Docker сетей
docker network ls

# Проверка сетевого подключения между контейнерами
docker-compose exec backend ping postgres

# Просмотр всех переменных окружения контейнера
docker-compose exec backend env

# Проверка размера Docker образов
docker images | grep myhouse

# Очистка неиспользуемых ресурсов (экономия дискового пространства)
docker system prune

# Просмотр занятого пространства Docker
docker system df
```

## 📖 Документация и ссылки

- [Docker официальная документация](https://docs.docker.com/)
- [Docker Compose справочник](https://docs.docker.com/compose/compose-file/)
- [PostgreSQL документация](https://www.postgresql.org/docs/)
- [TimescaleDB руководство](https://docs.timescale.com/)
- [Redis документация](https://redis.io/documentation)
- [Express.js руководство](https://expressjs.com/)
- [Node.js Best Practices](https://nodejs.org/en/docs/guides/)
