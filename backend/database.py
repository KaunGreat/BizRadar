"""
BizRadar · SQLite — путь к файлу БД читается из окружения (DATABASE_PATH),
папка создаётся автоматически при старте. В Docker путь указывает внутрь
именованного volume (см. docker-compose.yml → db-data:/data/bizradar),
поэтому данные переживают пересборку контейнеров.
"""

from __future__ import annotations

import logging
import os
import sqlite3

logger = logging.getLogger("bizradar.db")

# По умолчанию — рядом с кодом (локальный запуск без Docker).
# В проде переопределяется через .env.production: /data/bizradar/bizradar.db
DATABASE_PATH: str = os.getenv("DATABASE_PATH") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "bizradar.db"
)


def ensure_database(db_path: str = DATABASE_PATH) -> None:
    """Создаёт папку и схемы таблиц. Идемпотентна — зовётся при старте."""
    folder = os.path.dirname(os.path.abspath(db_path))
    os.makedirs(folder, exist_ok=True)

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS market_snapshots (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                niche_id   TEXT    NOT NULL,
                city       TEXT    NOT NULL,
                payload    TEXT    NOT NULL,
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                ttl_days   INTEGER NOT NULL DEFAULT 7
            )
            """
        )
        # Намерения пользователей — топливо CPA-маховика (лиды банкам).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS report_requests (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                niche      TEXT    NOT NULL,
                region     TEXT    NOT NULL,
                source     TEXT    NOT NULL,
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        # Региональная статистика: заполняется ПАКЕТНЫМ загрузчиком (раз в месяц),
        # рантайм читает только отсюда. Новые метрики (безработица, зарплата,
        # оборот розницы) добавляются либо колонками, либо в extras (JSON).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS region_stats (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                region_key TEXT    NOT NULL UNIQUE,  -- tomsk, tomskaya_oblast, ...
                region_name TEXT   NOT NULL,         -- «Томск» (отображаемое)
                level      TEXT    NOT NULL,         -- city | subject
                subject_key TEXT,                    -- для city — родительский субъект
                population INTEGER,                  -- постоянное население
                avg_income REAL,                     -- среднедушевые доходы, руб/мес
                extras     TEXT    NOT NULL DEFAULT '{}',  -- JSON: будущие метрики
                as_of      TEXT,                     -- дата актуальности данных
                source     TEXT    NOT NULL DEFAULT 'static-fallback',
                updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        # Matcher: кэш скоринга локаций (город + ниша, TTL 7 дней — как MarketSnapshot).
        # Городской запрос в Overpass тяжёлый, без кэша каждый запрос — больно.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS location_snapshots (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                city       TEXT    NOT NULL,
                niche_id   TEXT    NOT NULL,
                payload    TEXT    NOT NULL,
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                ttl_days   INTEGER NOT NULL DEFAULT 7
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_location_snapshots_city_niche "
            "ON location_snapshots (city, niche_id)"
        )
        conn.commit()
        logger.info("БД инициализирована: %s", db_path)
    finally:
        conn.close()
