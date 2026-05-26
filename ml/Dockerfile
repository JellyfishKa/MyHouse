FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/saved_models /data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/entrypoint.sh

VOLUME ["/data/ml_results", "/app/saved_models"]

EXPOSE 8002

ENTRYPOINT ["/app/entrypoint.sh"]
