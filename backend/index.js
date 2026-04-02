require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

// Конфигурация Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MyHouse API',
      version: '1.0.0',
      description: 'API для управления данными в MyHouse',
    },
    servers: [
      {
        url: 'http://localhost:8000',
        description: 'Development server',
      },
    ],
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

const app = express();
const port = process.env.PORT || 8000;

// Подключаем middleware (обработчики запросов)
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Swagger UI документация
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Создаём пул соединений с PostgreSQL для управления подключениями к БД
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Клиент Redis для управления кешем
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
  },
  password: process.env.REDIS_PASSWORD,
});

let redisConnected = false;

// Обработчик ошибок Redis
redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
  redisConnected = false;
});

redisClient.on('connect', () => {
  console.log('✓ Redis успешно подключен');
  redisConnected = true;
});

// Подключаемся к Redis
redisClient.connect().catch(console.error);

// Обработчик ошибок при неактивном подключении PostgreSQL
pool.on('error', (err) => {
  console.error('Непредвиденная ошибка при неактивном подключении', err);
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Проверка здоровья системы
 *     description: Проверяет состояние подключения к БД и Redis
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Система работает правильно
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 database:
 *                   type: string
 *                 redis:
 *                   type: string
 */
// Эндпоинт проверки здоровья системы
app.get('/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW()');
    const redisStatus = redisConnected ? 'connected' : 'disconnected';
    
    res.json({
      status: 'ok',
      timestamp: dbResult.rows[0].now,
      database: 'connected',
      redis: redisStatus,
    });
  } catch (error) {
    console.error('Ошибка при проверке здоровья:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/test:
 *   get:
 *     summary: Тест подключения к БД
 *     description: Проверяет подключение к PostgreSQL
 *     tags:
 *       - Database
 *     responses:
 *       200:
 *         description: Подключение успешно
 */
// Тестовый эндпоинт для проверки подключения к базе данных
app.get('/api/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT version()');
    res.json({
      message: 'Подключение к базе данных успешно',
      version: result.rows[0].version,
    });
  } catch (error) {
    console.error('Ошибка базы данных:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cache:
 *   post:
 *     summary: Сохранить значение в кеш
 *     description: Сохраняет ключ-значение в Redis
 *     tags:
 *       - Cache
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Значение сохранено
 */
// Эндпоинт для сохранения данных в Redis кеш
app.post('/api/cache', async (req, res) => {
  try {
    const { key, value } = req.body;
    await redisClient.set(key, value);
    res.json({ message: 'Значение сохранено в кеш', key, value });
  } catch (error) {
    console.error('Ошибка Redis:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/cache/{key}:
 *   get:
 *     summary: Получить значение из кеша
 *     description: Извлекает значение по ключу из Redis
 *     tags:
 *       - Cache
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Значение найдено
 */
// Эндпоинт для получения данных из Redis кеша
app.get('/api/cache/:key', async (req, res) => {
  try {
    const value = await redisClient.get(req.params.key);
    res.json({ key: req.params.key, value });
  } catch (error) {
    console.error('Ошибка Redis:', error);
    res.status(500).json({ error: error.message });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`✓ Backend сервер запущен на порту ${port}`);
  console.log(`✓ Окружение: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ База данных: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  console.log(`✓ Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
});

module.exports = app;
