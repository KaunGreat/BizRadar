"""
BizRadar · Pydantic-контракты API (модуль Matcher).

main.py остаётся тонким клеем: маршруты принимают/отдают эти модели,
вся логика — в services/location_matcher.py.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_MIN_PASSWORD_LEN = 8


class MatchLocationsRequest(BaseModel):
    """POST /api/v1/match-locations — тело запроса."""

    niche: str = Field(..., description="id ниши из каталога: coffee, pet, dental, ...")
    city: str = Field("tomsk", description="ключ города: tomsk | novosibirsk")
    limit: int = Field(5, ge=1, le=20, description="сколько ячеек в топ-подборке")
    cell_meters: int = Field(500, ge=250, le=1000, description="сторона ячейки, м (250-1000)")
    force_refresh: bool = Field(False, description="игнорировать кэш и сходить в Overpass заново")


class CellSignals(BaseModel):
    """Разбивка прокси-сигналов спроса в ячейке (по данным OSM)."""

    food: int = Field(..., description="общепит в целом (трафик)")
    offices: int = Field(..., description="офисы")
    residential: int = Field(..., description="жилые дома")
    transit: int = Field(..., description="остановки, станции, метро")
    family: int = Field(..., description="школы и детсады")


class LocationCell(BaseModel):
    """Ячейка сетки ~500x500 м."""

    id: str
    lat: float
    lon: float
    score: float = Field(..., description="0-100, нормировано по городу")
    competitors: int = Field(..., description="прямые конкуренты по нише")
    signals: CellSignals
    district: Optional[str] = Field(None, description="ближайший район (подпись для карты)")
    reason: Optional[str] = Field(None, description="пояснение — только для топ-подборки")


class MatchStats(BaseModel):
    cells_total: int = Field(..., description="всего ячеек в сетке города")
    cells_scored: int = Field(..., description="ячеек с ненулевым спросом")
    points_total: int = Field(..., description="точек OSM в ответе Overpass")
    competitors: int = Field(..., description="прямых конкурентов по нише")


class MatchLocationsResponse(BaseModel):
    city: str
    city_name: str
    niche: str
    niche_title: str
    cell_meters: int
    source: str = Field(..., description="overpass | cache | cache_stale")
    generated_at: str
    cache_created_at: Optional[str] = None
    note: Optional[str] = None
    stats: MatchStats
    top: List[LocationCell]
    cells: List[LocationCell] = Field(..., description="все непустые ячейки для отрисовки карты")


class CityInfo(BaseModel):
    key: str
    name: str
    cell_meters: int


# ------------------------------------------------------------- История анализов
class ProjectCreateRequest(BaseModel):
    """POST /api/v1/projects — сохранить анализ в историю."""

    niche_id: str
    niche_title: str = ""
    city: str = ""
    city_name: str = ""
    score: float = 0
    survival: int = 0
    snapshot: Dict[str, Any] = Field(default_factory=dict, description="метрики + отчёт; открываются без повторного парсинга")


# ---------------------------------------------------------------- Аутентификация
def _normalize_email(v: str) -> str:
    v = v.strip().lower()
    if not _EMAIL_RE.match(v):
        raise ValueError("некорректный формат e-mail")
    return v


def _check_password(v: str) -> str:
    if len(v) < _MIN_PASSWORD_LEN:
        raise ValueError(f"пароль должен быть не короче {_MIN_PASSWORD_LEN} символов")
    return v


class RegisterRequest(BaseModel):
    """POST /api/auth/register."""

    email: str
    password: str
    name: str = ""

    @field_validator("email")
    @classmethod
    def email_ok(cls, v: str) -> str:
        return _normalize_email(v)

    @field_validator("password")
    @classmethod
    def password_ok(cls, v: str) -> str:
        return _check_password(v)


class LoginRequest(BaseModel):
    """POST /api/auth/login."""

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_ok(cls, v: str) -> str:
        return _normalize_email(v)


class ChangePasswordRequest(BaseModel):
    """POST /api/auth/change-password (приватный)."""

    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_ok(cls, v: str) -> str:
        return _check_password(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="срок жизни токена, секунд")
    user: Dict[str, Any]


class PdfReportRequest(BaseModel):
    """POST /api/v1/report/pdf — бизнес-план в PDF.

    Принимает те же параметры, что и анализ: ниша (id или название), регион,
    бюджет. Секции — опционально (иначе PDF_SECTIONS из конфига): фундамент
    для бесплатной/премиум-версий.
    """

    niche: str
    region: str = "Российская Федерация"
    budget: float = Field(0, ge=0, description="бюджет запуска, руб.; 0 — взять из каталога/кэша")
    sections: Optional[List[str]] = Field(None, description="список id секций; пусто — из конфига")


class UserPublic(BaseModel):
    """Публичное представление пользователя — БЕЗ хэша пароля."""

    id: int
    email: str
    name: str
    role: str
    status: str
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None


# ------------------------------------------------------------ Финансовая модель
class FinanceParams(BaseModel):
    """Параметры юнит-экономики. Все поля опциональны: что не передано —
    берётся из пресета ниши с региональной поправкой."""

    avg_check: Optional[float] = Field(None, description="средний чек, ₽")
    clients_per_day: Optional[float] = Field(None, description="клиентов в день")
    days_per_month: Optional[float] = Field(None, description="рабочих дней в месяце")
    margin_pct: Optional[float] = Field(None, description="маржа, % выручки после переменных затрат")
    rent: Optional[float] = Field(None, description="аренда, ₽/мес")
    staff: Optional[float] = Field(None, description="ФОТ, ₽/мес")
    other_fixed: Optional[float] = Field(None, description="прочие постоянные, ₽/мес")
    investment: Optional[float] = Field(None, description="стартовые инвестиции, ₽")


class FinanceModelRequest(BaseModel):
    """POST /api/v1/finance/model — юнит-экономика точки."""

    niche: str = Field(..., description="id ниши из каталога: coffee, pet, dental, ...")
    region: str = Field("tomsk", description="регион/город для поправки (томск, москва, «Томск»...)")
    params: Optional[FinanceParams] = Field(None, description="пользовательские значения поверх пресета")
