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
    ForeignKey,
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
    """История анализов: сохранённые проекты (город, ниша, скор, снимок + отчёт).

    user_id — владелец проекта (внешний ключ на users). NULL означает
    гостевой анализ (создан до входа): такие записи не показываются никому
    в списке и доступны только по прямой ссылке-идентификатору.
    """

    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    niche_id = Column(String, nullable=False)
    niche_title = Column(String, nullable=False)
    city = Column(String, nullable=False, server_default=text("''"))
    city_name = Column(String, nullable=False, server_default=text("''"))
    score = Column(Float, nullable=False, server_default=text("0"))
    survival = Column(Integer, nullable=False, server_default=text("0"))
    has_report = Column(Integer, nullable=False, server_default=text("0"))
    snapshot = Column(Text, nullable=False, server_default=text("'{}'"))
    created_at = Column(DateTime, nullable=False, server_default=_NOW)

    __table_args__ = (
        Index("idx_projects_created", created_at.desc()),
        Index("idx_projects_user_created", "user_id", created_at.desc()),
    )


class User(Base):
    """Пользователь личного кабинета.

    Пароль хранится ТОЛЬКО в виде bcrypt-хэша (password_hash). E-mail
    уникален и приводится к нижнему регистру при создании. Роль и статус
    управляются административно; по умолчанию — user / active.
    """

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(320), nullable=False, unique=True)      # нормализован: нижний регистр
    password_hash = Column(String(128), nullable=False)           # bcrypt, никогда не хранится открыто
    name = Column(String(160), nullable=False, server_default=text("''"))
    role = Column(String(20), nullable=False, server_default=text("'user'"))      # user | admin
    status = Column(String(20), nullable=False, server_default=text("'active'"))  # active | blocked
    created_at = Column(DateTime, nullable=False, server_default=_NOW)
    last_login_at = Column(DateTime, nullable=True)

    __table_args__ = (Index("idx_users_email", "email"),)


class ActionLog(Base):
    """Журнал действий пользователей (аудит).

    user_id может быть NULL для анонимных событий (например, неудачный вход
    до создания аккаунта). В details — произвольный JSON-контекст; пароли
    и токены сюда НЕ пишутся (контролируется в services/audit.py).
    """

    __tablename__ = "action_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)                      # NULL = анонимно
    action = Column(String(64), nullable=False)                   # register, login, login_failed, ...
    entity_type = Column(String(64), nullable=True)               # niche, location, user, ...
    entity_id = Column(String(64), nullable=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    details = Column(Text, nullable=False, server_default=text("'{}'"))   # JSON без секретов
    created_at = Column(DateTime, nullable=False, server_default=_NOW)

    __table_args__ = (
        Index("idx_action_logs_user_created", "user_id", created_at.desc()),
        Index("idx_action_logs_action", "action"),
    )
