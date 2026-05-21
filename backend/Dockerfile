FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python3 -c "d=open('requirements.txt','rb').read();open('/tmp/req.txt','w').write(d.replace(b'\xff\xfe',b'').replace(b'\xfe\xff',b'').replace(b'\x00',b'').decode('ascii','ignore'))" && pip install --no-cache-dir -r /tmp/req.txt

COPY . .

RUN groupadd -g 1001 appuser && \
    useradd -u 1001 -g appuser appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["sh", "start.sh"]
