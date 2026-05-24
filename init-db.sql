-- Базовая инициализация контейнера Postgres.
-- Схема приложения создаётся Alembic-миграциями из backend/start.sh.
CREATE EXTENSION IF NOT EXISTS timescaledb;

SELECT 'TimescaleDB extension is ready. Application schema will be created by Alembic.' AS status;
