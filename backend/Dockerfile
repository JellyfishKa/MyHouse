# Этап 1: Сборка зависимостей
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

# Этап 2: Создание финального образа
FROM node:18-alpine

WORKDIR /app

# Устанавливаем dumb-init для корректной обработки сигналов прерывания
RUN apk add --no-cache dumb-init

# Копируем зависимости из этапа сборки
COPY --from=builder /app/node_modules ./node_modules

# Копируем файлы приложения
COPY . .

# Создаём непривилегированного пользователя для безопасности контейнера
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["node", "index.js"]
