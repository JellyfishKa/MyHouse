#!/bin/sh
# Применяем Alembic миграции (создаём таблицы)
alembic -c app/models/database/alembic.ini upgrade head

# Запускаем FastAPI (uvicorn) на порту 8000
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
