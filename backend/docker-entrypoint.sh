#!/bin/sh
# ============================================================
# BizRadar API · точка входа контейнера
#   1. ждём готовности БД (Postgres в контейнере db поднимается дольше,
#      чем стартует api) — retry через db.wait_for_db;
#   2. накатываем миграции Alembic до актуальной схемы;
#   3. стартуем uvicorn.
# DATABASE_URL приходит из окружения (см. docker-compose.yml / .env.production).
# ============================================================
set -e

echo "[entrypoint] DATABASE_URL=${DATABASE_URL%%@*}@... (пароль скрыт)"

echo "[entrypoint] 1/3 ждём готовности БД..."
python - <<'PY'
from db import wait_for_db
wait_for_db(retries=30, delay=2.0)
PY

echo "[entrypoint] 2/3 накатываем миграции Alembic..."
alembic upgrade head

echo "[entrypoint] 3/3 стартуем uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
