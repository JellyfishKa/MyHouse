FROM python:3.11-slim

WORKDIR /app

# Node.js 18 + системные зависимости
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl dumb-init gcc \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Node.js зависимости
COPY package*.json ./
RUN npm install --omit=dev

# Python зависимости (конвертация из UTF-16 если нужно)
COPY requirements.txt ./
RUN python3 -c "d=open('requirements.txt','rb').read();open('/tmp/req.txt','w').write(d.replace(b'\xff\xfe',b'').replace(b'\xfe\xff',b'').replace(b'\x00',b'').decode('ascii','ignore'))" && pip install --no-cache-dir -r /tmp/req.txt

# Исходный код
COPY . .

RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8000 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["sh", "start.sh"]
