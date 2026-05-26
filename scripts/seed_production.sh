#!/usr/bin/env sh
# Seed demo data on production server (FirstVDS / DuckDNS).
# Usage: DOMAIN=pulsetok.duckdns.org ./scripts/seed_production.sh
#    or: ./scripts/seed_production.sh https://pulsetok.duckdns.org

set -e

if [ -n "$1" ]; then
  BASE="$1"
elif [ -n "$DOMAIN" ]; then
  BASE="https://${DOMAIN}"
else
  echo "Укажите DOMAIN или URL: ./scripts/seed_production.sh https://pulsetok.duckdns.org" >&2
  exit 1
fi

API_URL="${BASE%/}/api/v1"

echo "==> Регистрация объекта и сенсоров: ${API_URL}"
python3 infra/seed.py --api "${API_URL}"

echo "==> Загрузка оборудования и readings: ${API_URL}"
API_URL="${API_URL}" python3 scripts/seed_demo.py

echo "==> Seed завершён. Откройте ${BASE} → Dashboard"
