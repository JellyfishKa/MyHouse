FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ git \
    libhdf5-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

VOLUME ["/data/ml_results"]

EXPOSE 8002

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8002"]
