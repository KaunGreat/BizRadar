"""
BizRadar · слой БД (обёртка обратной совместимости).

Исторически модуль управлял SQLite напрямую через sqlite3. Теперь вся работа
с данными идёт через SQLAlchemy (db.py + models.py), а этот файл оставлен,
чтобы бизнес-код не менял привычные импорты:

    from database import DATABASE_PATH, ensure_database

Актуальные сущности:
  * DATABASE_URL / engine / SessionLocal / Base — в db.py;
  * таблицы — в models.py;
  * схемы накатываются Alembic (см. alembic/ и docker-entrypoint.sh).
"""

from __future__ import annotations

import logging

import models  # noqa: F401 — регистрирует таблицы в Base.metadata
from db import (  # noqa: F401 — реэкспорт для старого кода
    DATABASE_PATH,
    DATABASE_URL,
    IS_POSTGRES,
    IS_SQLITE,
    Base,
    SessionLocal,
    engine,
    is_alive,
    safe_url,
    wait_for_db,
)

logger = logging.getLogger("bizradar.db")


def ensure_database(db_path: str = DATABASE_PATH) -> None:  # noqa: ARG001
    """Создаёт таблицы, которых ещё нет. Идемпотентна.

    * В Docker схемы накатывает Alembic при старте контейнера
      (docker-entrypoint.sh → `alembic upgrade head`), create_all здесь — страховка.
    * Локально с SQLite create_all создаёт всё сразу, чтобы работало без миграций.
    """
    Base.metadata.create_all(bind=engine)
    logger.info("Схемы БД готовы (%s)", safe_url())
