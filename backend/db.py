"""
BizRadar · подключение к БД (SQLAlchemy).

Единая строка подключения — переменная окружения DATABASE_URL:
  * Docker / прод:  postgresql://bizradar:<пароль>@db:5432/bizradar
  * Локально без Docker: не задаём ничего — создаётся SQLite рядом с кодом
    (или путь из DATABASE_PATH для обратной совместимости).

Alembic читает ту же переменную (alembic/env.py) — миграции и рантайм
смотрят на одну и ту же базу, рассинхрон невозможен.
"""

from __future__ import annotations

import logging
import os
import time

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger("bizradar.db")

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def _default_sqlite_url() -> str:
    """Локальный запуск без Docker: SQLite рядом с кодом (работает из коробки)."""
    path = os.getenv("DATABASE_PATH") or os.path.join(_BACKEND_DIR, "data", "bizradar.db")
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return "sqlite:///" + path


DATABASE_URL: str = (os.getenv("DATABASE_URL") or "").strip() or _default_sqlite_url()
IS_SQLITE: bool = DATABASE_URL.startswith("sqlite")
IS_POSTGRES: bool = DATABASE_URL.startswith("postgresql")

# Обратная совместимость: старый код и /api/health читали DATABASE_PATH
# (имеет смысл только для SQLite; для Postgres — пустая строка).
DATABASE_PATH: str = os.getenv("DATABASE_PATH") or (
    DATABASE_URL[len("sqlite:///"):] if IS_SQLITE else ""
)

_engine_kwargs: dict = {"future": True, "pool_pre_ping": True}
if IS_SQLITE:
    # FastAPI исполняет синхронные эндпоинты в пуле потоков.
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def safe_url() -> str:
    """Строка подключения для логов и /api/health — без пароля."""
    if "@" in DATABASE_URL:
        return "...@" + DATABASE_URL.split("@", 1)[1]
    return DATABASE_URL


def is_alive() -> bool:
    """Быстрая проверка связи с БД (для /api/health)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


def wait_for_db(retries: int = 30, delay: float = 2.0) -> None:
    """
    Ждём, пока БД начнёт отвечать. Критично в Docker: контейнер api стартует
    раньше, чем Postgres успевает инициализировать кластер — без retry
    миграции и приложение падали бы на холодном старте.
    """
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("БД готова (%s, попытка %d)", safe_url(), attempt)
            return
        except Exception as exc:  # noqa: BLE001
            last = exc
            logger.warning("БД не готова (попытка %d/%d): %s", attempt, retries, exc.__class__.__name__)
            time.sleep(delay)
    raise RuntimeError(f"Не удалось дождаться готовности БД ({safe_url()}): {last}")
