"""
BizRadar · Pydantic-контракты API (модуль Matcher).

main.py остаётся тонким клеем: маршруты принимают/отдают эти модели,
вся логика — в services/location_matcher.py.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


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
