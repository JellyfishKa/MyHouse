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
## Применение методов NILM для анализа потоков напряжения и выявления неполадок оборудования
Традиционные методы диагностики требуют установки датчиков на каждый агрегат. NILM позволяет анализировать состояние оборудования, используя только данные с главного электросчетчика (основного ввода), что снижает затраты на аппаратное обеспечение и упрощает внедрение систем предиктивной аналитики.
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

[Nature Scientific Data (Kolter & Johnson, 2015)](https://www.nature.com/articles/sdata20157):

Суть: Описание методологии сбора REDD.

Применимость: Дает понимание физической основы данных (напряжение, ток, активная мощность), что критично для перехода от бытовых приборов к промышленным станкам.

[Kolter & Johnson (NILM Paper)](https://zicokolter.com/publications/kolter2011redd.pdf):

Суть: Оригинальная работа, представляющая REDD и базовые алгоритмы NILM.

Применимость: Использована для понимания эталонных алгоритмов (FHMM, Combinatorial Optimization) как бейзлайнов для сравнения.

[NILMTK (GitHub)](https://github.com/nilmtk/nilmtk/tree/303d45bf6c39b44d76c35e8aaa690cef6af8ae38):

Суть: Фреймворк для обработки данных энергопотребления.

Применимость: Полноценный исследовательский фреймворк для NILM/NILP, предназначенный для воспроизводимых экспериментов с декомпозицией энергопотребления.

[GitHub (inesylla/energy-disaggregation-DL)](https://github.com/inesylla/energy-disaggregation-DL):

Суть: Репозиторий содержит реализации глубокого обучения для энергодизагрегации (не завершенный).

Применимость: Рассмотрены архитектуры нейронных сетей (RNN, LSTM, Seq2Point), которые могут быть адаптированы для выделения сигнатуры работы станка из общего потока.

## Методология исследования

Для достижения цели (выявление неполадок на производстве) была предложена следующая методология, базирующаяся на принципах NILM:

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
Был проведен анализ структуры датасета REDD и изучены ключевые источники по теме NILM. Установлено, что методология неинтрузивного мониторинга нагрузки применима для промышленных задач при условии адаптации архитектур нейросетей, методов предобработки и более глубокого изучения проблемы на реальных данных.
