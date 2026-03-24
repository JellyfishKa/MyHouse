# MyHouse

Project from Faculty of maths and IT MRSU for Accelerator "OgarevPRO"

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
---

REST API для MyHouse на базе Docker (PostgreSQL + TimescaleDB + Redis + Node.js).

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
