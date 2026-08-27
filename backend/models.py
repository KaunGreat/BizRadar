"""
BizRadar · ORM-модели (SQLAlchemy).

Схемы один-в-один повторяют таблицы, которые раньше создавались в database.py
вручную. Это единственный источник правды о структуре БД:
  * Alembic-миграции генерируются/сверяются против Base.metadata;
  * рантайм читает/пишет через эти модели (SessionLocal из db.py).

server_default=CURRENT_TIMESTAMP выбран сознательно: одинаково валиден
и в PostgreSQL, и в SQLite — миграции переносимы между окружениями.
"""

from __future__ import annotations

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    text,
)

from db import Base

_NOW = text("CURRENT_TIMESTAMP")


class MarketSnapshot(Base):
    """Снимок рынка по нише+городу (кэш парсера конкурентов, TTL 7 дней)."""

    __tablename__ = "market_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    niche_id = Column(String, nullable=False)
    city = Column(String, nullable=False)
    payload = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=_NOW)
    ttl_days = Column(Integer, nullable=False, server_default=text("7"))


class ReportRequest(Base):
    """Намерения пользователей — топливо CPA-маховика (лиды банкам)."""

    __tablename__ = "report_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    niche = Column(String, nullable=False)
    region = Column(String, nullable=False)
    source = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=_NOW)


class RegionStat(Base):
    """Региональная статистика: заполняется пакетным загрузчиком (раз в месяц).

    Новые метрики (безработица, средняя зарплата, оборот розницы) добавляются
    либо колонками (миграцией), либо в extras (JSON).
    """

    __tablename__ = "region_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    region_key = Column(String, nullable=False, unique=True)   # tomsk, tomskaya_oblast, ...
    region_name = Column(String, nullable=False)               # «Томск»
    level = Column(String, nullable=False)                     # city | subject
    subject_key = Column(String)                               # для city — родительский субъект
    population = Column(Integer)                               # постоянное население
    avg_income = Column(Float)                                 # среднедушевые доходы, руб/мес
    extras = Column(Text, nullable=False, server_default=text("'{}'"))
    as_of = Column(String)                                     # дата актуальности данных
    source = Column(String, nullable=False, server_default=text("'static-fallback'"))
    updated_at = Column(DateTime, nullable=False, server_default=_NOW)


class LocationSnapshot(Base):
    """Matcher: кэш скоринга локаций (город + ниша, TTL 7 дней)."""

    __tablename__ = "location_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    city = Column(String, nullable=False)
    niche_id = Column(String, nullable=False)
    payload = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=_NOW)
    ttl_days = Column(Integer, nullable=False, server_default=text("7"))

    __table_args__ = (Index("idx_location_snapshots_city_niche", "city", "niche_id"),)


class Project(Base):
    """История анализов: сохранённые проекты (город, ниша, скор, снимок + отчёт)."""

    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    niche_id = Column(String, nullable=False)
    niche_title = Column(String, nullable=False)
    city = Column(String, nullable=False, server_default=text("''"))
    city_name = Column(String, nullable=False, server_default=text("''"))
    score = Column(Float, nullable=False, server_default=text("0"))
    survival = Column(Integer, nullable=False, server_default=text("0"))
    has_report = Column(Integer, nullable=False, server_default=text("0"))
    snapshot = Column(Text, nullable=False, server_default=text("'{}'"))
    created_at = Column(DateTime, nullable=False, server_default=_NOW)

    __table_args__ = (Index("idx_projects_created", created_at.desc()),)
