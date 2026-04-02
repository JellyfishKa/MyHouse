#!/bin/sh
# Применяем Alembic миграции (создаём таблицы)
alembic -c app/models/database/alembic.ini upgrade head

# Запускаем FastAPI (uvicorn) на порту 8001 в фоне
uvicorn app.main:app --host 0.0.0.0 --port 8001 &

# Запускаем Node.js (Express) на порту 8000 как основной процесс
exec node index.js
