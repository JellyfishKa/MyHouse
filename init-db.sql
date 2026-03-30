-- Активируем расширение TimescaleDB для работы с временными рядами
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Создаём таблицу пользователей
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создаём таблицу событий (временных рядов)
CREATE TABLE IF NOT EXISTS events (
  time TIMESTAMP NOT NULL,
  user_id INTEGER REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  details JSONB,
  PRIMARY KEY (time, user_id)
);

-- Преобразуем таблицу events в гипертаблицу TimescaleDB для оптимизации временных данных
SELECT create_hypertable('events', 'time', if_not_exists => TRUE);

-- Создаём индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

-- Проверка успешной инициализации базы данных
SELECT 'MyHouse база данных инициализирована с TimescaleDB' AS status;
