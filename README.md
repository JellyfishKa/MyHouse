# MyHouse (ПУЛЬСТОК)

Система мониторинга энергопотребления и предиктивной аналитики для ЦОД и промышленных объектов: телеметрия по категориям нагрузки, гармонический анализ, ML-обнаружение аномалий.
Проект факультета математики и ИТ МГУ им. Н.П. Огарева для Акселератора «ОгарёвPRO».

**Стек:** React + TypeScript + Vite, FastAPI, PostgreSQL + TimescaleDB, ML (sklearn), Docker.

---

## Деплой

| Сценарий | Документация |
|----------|--------------|
| VDS (FirstVDS + DuckDNS + Docker) | [docs/DEPLOY_FIRSTVDS.md](docs/DEPLOY_FIRSTVDS.md) |
| Облако (Railway + Vercel) | [docs/DEPLOY_RAILWAY_VERCEL.md](docs/DEPLOY_RAILWAY_VERCEL.md) |
| Локальная разработка | [DOCKER_SETUP.md](DOCKER_SETUP.md) |

---

## Требования

- [Docker](https://docs.docker.com/get-docker/) 20.10+
- [Docker Compose](https://docs.docker.com/compose/install/) 2.0+
- [Git](https://git-scm.com/)
- Python 3.11+ (для seed-скрипта и ML-утилит)

---

## Быстрый старт (локально)

```bash
git clone https://github.com/JellyfishKa/MyHouse.git
cd MyHouse
cp .env.example .env
docker compose up -d --build
```

Заполнить БД тестовыми данными (объект + 4 сенсора):

```bash
python infra/seed.py
python scripts/seed_demo.py
```

---

## Сервисы после запуска

| Сервис | URL / Порт | Описание |
|--------|-----------|----------|
| Frontend (Docker) | http://localhost:3000 | React SPA + nginx proxy |
| FastAPI + Swagger | http://localhost:3000/docs | REST API (через nginx) |
| PostgreSQL + TimescaleDB | localhost:5432 | База данных (только internal в prod) |
| ML service | localhost:8002 | Аномалии и RUL (internal в prod) |

Проверка работоспособности:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/healthcheck
curl http://localhost:3000/api/v1/ml/health
```

Production на VDS: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` — см. [DEPLOY_FIRSTVDS.md](docs/DEPLOY_FIRSTVDS.md).

---

## Frontend (локальная разработка)

```bash
npm install
npm run dev
```

Открыть: http://localhost:5173

---

## Загрузка REDD данных

После запуска seed-скрипта:

```bash
python ml/load_csv.py \
  --file data/redd/redd_house1_0.csv \
  --redd \
  --sensor-id a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11
```

---

## Переменные окружения (.env)

| Переменная | Дефолт | Описание |
|------------|--------|----------|
| `DOMAIN` | — | Поддомен DuckDNS (production) |
| `DB_USER` | `postgres` | Пользователь БД |
| `DB_PASSWORD` | `postgres` | Пароль БД |
| `DB_NAME` | `myhouse` | Имя базы данных |
| `DB_PORT` | `5432` | Порт PostgreSQL |
| `BACKEND_PORT` | `8000` | Порт FastAPI (dev) |
| `ML_SERVICE_URL` | `http://ml:8002` | URL ML-сервиса |
| `CORS_ORIGINS` | localhost | Разрешённые origins для CORS |
| `VITE_API_URL` | `/api/v1` в Docker prod | Base URL API для фронта |

Полный список: [.env.example](.env.example).

---

## Полезные команды

```bash
# Логи всех сервисов
docker compose logs -f

# Логи backend
docker compose logs -f backend

# Подключение к БД
docker compose exec postgres psql -U postgres -d myhouse

# Seed через API (production)
./scripts/seed_production.sh https://pulsetok.duckdns.org

# Пересборка backend
docker compose up -d --build backend

# Production stack (VDS)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Остановить всё
docker compose down
```

---

## Известные проблемы

- `requirements.txt` может сохраняться в UTF-16 на Windows — Dockerfile автоматически конвертирует при сборке.
- `nilmtk-contrib` (сторонний пакет) несовместим с Python 3.11.15+ — не включён в зависимости ML-сервиса.

---

## Документация

- [docs/DEPLOY_FIRSTVDS.md](docs/DEPLOY_FIRSTVDS.md) — Деплой на VDS (Docker + DuckDNS)
- [docs/DEPLOY_RAILWAY_VERCEL.md](docs/DEPLOY_RAILWAY_VERCEL.md) — Деплой в облако (Railway + Vercel)
- [DOCKER_SETUP.md](DOCKER_SETUP.md) — Локальный Docker (legacy, частично устарел)
- [LICENSE](LICENSE) — ISC лицензия
## Мониторинг энергопотребления и выявление неполадок оборудования
Традиционные методы диагностики требуют установки датчиков на каждый агрегат. ПУЛЬСТОК агрегирует данные по категориям нагрузки (серверы, охлаждение, ИБП, освещение) с главного ввода и выявляет аномалии по току, мощности и гармоникам — без поштучной установки датчиков на каждую единицу оборудования.
## Обзор источников данных и литературы
### 1. Датасет REDD (Reference Energy Disaggregation Data Set)

В качестве основы для анализа использован публичный датасет REDD. Данные представлены в формате CSV с временными метками (индексами строк), показывающими потребляемую мощность (Вт) по отдельным приборам и суммарный поток на главном вводе (main).

#### Структура данных:

Файлы организованы по домам (redd_house1_i.csv ... redd_house6_i.csv). Набор приборов варьируется от дома к дому.
| Характеристика | Описание | 
| :--- | ---: |
| Формат | CSV | 
| Частота дискретизации | 1 Гц (одна строка = 1 секунда) |
| Колонки | Временная метка (индекс), названия приборов (например, fridge, microwave), колонка main (суммарная нагрузка)|
| Особенности | В разных домах разный набор электроприборов (например, в house2 есть waste disposal unit, в house3 — CE appliance). |

Пример данных (house1):
```
, dish washer, electric space heater, electric stove, fridge, microwave, washer dryer, main
0, 0.0, 0.0, 0.0, 6.0, 4.0, 0.0, 103.79
1, 0.0, 0.0, 0.0, 6.0, 4.0, 0.0, 99.63
...
```

### 2. Обзор исследовательских источников
В ходе работы были проанализированы следующие источники для определения методологии:

[PSE Community (LAPSE-2023.23279)](https://psecommunity.org/wp-content/plugins/wpor/includes/file/2303/LAPSE-2023.23279-1v1.pdf):

Суть: Научная статья, посвященная современным подходам к неинтрузивному мониторингу.

Применимость: Подтверждает эффективность использования __высокочастотных данных__ для обнаружения аномалий в работе оборудования.

[Kolter & Johnson (REDD Paper)](https://zicokolter.com/publications/kolter2011redd.pdf):

Суть: Оригинальная работа, представляющая REDD и базовые алгоритмы разложения нагрузки.

Применимость: Использована для понимания эталонных алгоритмов (FHMM, Combinatorial Optimization) как бейзлайнов для сравнения.

[Energy analytics toolkit (GitHub)](https://github.com/nilmtk/nilmtk/tree/303d45bf6c39b44d76c35e8aaa690cef6af8ae38):

Суть: Фреймворк для обработки данных энергопотребления.

Применимость: Исследовательский фреймворк для воспроизводимых экспериментов с временными рядами энергопотребления.

[GitHub (inesylla/energy-disaggregation-DL)](https://github.com/inesylla/energy-disaggregation-DL):

Суть: Репозиторий содержит реализации глубокого обучения для энергодизагрегации (не завершенный).

Применимость: Рассмотрены архитектуры нейронных сетей (RNN, LSTM, Seq2Point), которые могут быть адаптированы для выделения сигнатуры работы станка из общего потока.

## Методология исследования

Для достижения цели (выявление неполадок на производстве) была предложена следующая методология мониторинга:

1. Анализ данных REDD
2. Предобработка (ETL)
3. Архитектура решения:

    + Вход: Временной ряд суммарной мощности (аналог main на производстве).

    + Выход: Прогнозируемый временной ряд потребления конкретного станка (целевая нагрузка).

    + Модель: Использование DL моделей для захвата как кратковременных импульсов (включение станка), так и долговременных циклов работы.

## Результаты анализа данных REDD

В ходе первичного анализа структуры данных были сделаны следующие наблюдения, важные для проекта:
| Дом (House) | Описание | 
| :---: | :--- |
| House 1 | Стабильные низкие значения fridge (6W), пики отсутствуют. | 
| House 2 | Наличие waste disposal unit. Резкие скачки до 160W. |
| House 3 | Присутствие CE appliance (бытовая электроника) и electric furnace. |
| House 5 | Аномально высокие значения (до 6000W+). Присутствие electric space heater и furnace. |
| House 6 | Широкий спектр приборов, сложная динамика. |

Вывод по данным: Датасет REDD предоставляет разнообразные профили нагрузки. Для проекта по выявлению неполадок станков наиболее полезны данные House 5 (высокая мощность, схожая с промышленной) и House 2 (наличие резких импульсов, характерных для механических поломок).

## Заключении 
Был проведен анализ структуры датасета REDD и изучены ключевые источники по теме мониторинга нагрузки. Установлено, что подходы анализа временных рядов энергопотребления применимы для промышленных задач при адаптации ML-моделей и методов предобработки под реальные данные ЦОД.
