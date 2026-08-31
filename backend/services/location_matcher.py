"""
BizRadar · Matcher — подбор конкретной локации для открытия внутри города.

ВЫБРАННЫЙ ПОДХОД: сетка ячеек ~500x500 м (а не границы районов). Почему:
  1. Масштаб решения. Район — это 2-8 км; вопрос «где именно открыться»
     решается на пешеходном радиусе, 500 м — естественная ячейка спроса.
  2. Один запрос к Overpass. Точки на весь bbox города забираются ОДНИМ
     запросом (тот же паттерн, что у парсера конкурентов), а раскладка по
     ячейкам — чистая арифметика локально. Районный подход потребовал бы
     грузить границы (relation'ы) и считать point-in-polygon.
  3. Универсальность. Сетка не зависит от админданных: новый город =
     добавить bbox в CITY_BBOX. Название района при этом даётся бонусом —
     по ближайшему центроиду (см. DISTRICT_CENTROIDS).
  4. Рендер. Ячейки с координатами рисуются тепловой картой в любом
     Leaflet/Yandex-фронтенде без дополнительной обработки.

Скор ячейки (эвристика v1):
    raw_demand  = Σ weight[s] · min(count[s], cap[s])      # насыщение сигналов
    opportunity = raw_demand / (1 + competitors)           # из ТЗ
    score       = opportunity / max(opportunity) · 100     # нормировка по городу

Кэш: таблица location_snapshots (город + ниша, TTL 7 дней — как
MarketSnapshot). Городской запрос тяжёлый, поэтому:
    свежий кэш -> отдаём его (source=cache);
    Overpass упал -> stale-кэш, если есть (source=cache_stale), иначе 503;
    force_refresh=true -> минуем чтение кэша, пишем новый.
"""

from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from catalog import NICHES_BY_ID
from db import SessionLocal
from models import LocationSnapshot
from services.overpass import (
    BBox,
    OverpassError,
    Selector,
    fetch_elements,
)

logger = logging.getLogger("bizradar.matcher")

SNAPSHOT_TTL_DAYS = 7
MIN_POINTS = 60          # меньше — «данных слишком мало», не строим карту
MAX_CELLS_IN_RESPONSE = 500

# ---------------------------------------------------------------- города
# bbox: (south, west, north, east). Москва сознательно не поддерживается:
# её bbox рвёт лимиты публичного Overpass — честнее сказать об этом сразу.
CITY_BBOX: Dict[str, Dict[str, Any]] = {
    "tomsk": {"name": "Томск", "bbox": (56.365, 84.700, 56.555, 85.100)},
    "novosibirsk": {"name": "Новосибирск", "bbox": (54.830, 82.700, 55.200, 83.200)},
}

# Районы подписываются по ближайшему центроиду (бонус поверх сетки).
DISTRICT_CENTROIDS: Dict[str, List[Tuple[str, float, float]]] = {
    "tomsk": [
        ("Кировский", 56.445, 84.920),
        ("Советский", 56.475, 84.965),
        ("Октябрьский", 56.490, 85.010),
        ("Ленинский", 56.405, 84.970),
    ],
    "novosibirsk": [
        ("Центральный", 55.030, 82.920),
        ("Железнодорожный", 55.045, 82.900),
        ("Октябрьский", 54.990, 82.970),
        ("Ленинский", 54.950, 82.870),
    ],
}

# ------------------------------------------- теги конкурентов по нишам
COMPETITOR_TAGS: Dict[str, List[Selector]] = {
    "coffee": [{"amenity": "cafe"}],
    "coffee_house": [{"amenity": "cafe"}, {"amenity": "restaurant"}],
    "pizzeria": [{"amenity": "restaurant", "cuisine": "pizza"}, {"amenity": "fast_food", "cuisine": "pizza"}],
    "shawarma": [{"amenity": "fast_food"}],
    "nails": [{"shop": "beauty"}],
    "barber": [{"shop": "hairdresser"}],
    "lashes": [{"shop": "beauty"}],
    "solarium": [{"shop": "beauty"}],
    "kids_center": [{"amenity": "school"}],
    "robotics": [{"amenity": "school"}],
    "kindergarten": [{"amenity": "kindergarten"}, {"amenity": "school"}],
    "clothes": [{"shop": "clothes"}],
    "cosmetics": [{"shop": "cosmetics"}, {"shop": "beauty"}],
    "pet": [{"shop": "pet"}],
    "auto": [{"shop": "car_repair"}],
    "cleaning": [{"shop": "laundry"}, {"shop": "dry_cleaning"}],
    "dental": [{"amenity": "dentist"}],
    "pharmacy": [{"amenity": "pharmacy"}],
}

# ------------------------------- прокси-сигналы спроса (общие для ниш)
SIGNAL_SELECTORS: List[Selector] = [
    {"amenity": "restaurant"}, {"amenity": "cafe"}, {"amenity": "fast_food"},  # трафик общепита
    {"office": None},                                                          # офисы
    {"building": "apartments"}, {"building": "residential"}, {"building": "dormitory"},  # жильё
    {"highway": "bus_stop"}, {"railway": "station"}, {"railway": "halt"},      # транспорт
    {"railway": "tram_stop"}, {"railway": "subway_entrance"},
    {"amenity": "school"}, {"amenity": "kindergarten"},                        # семьи с детьми
]

FOOD_TAGS = {"restaurant", "cafe", "fast_food"}
TRANSIT_RAIL = {"station", "halt", "tram_stop", "subway_entrance"}
RESIDENTIAL_TAGS = {"apartments", "residential", "dormitory"}
FAMILY_TAGS = {"school", "kindergarten"}

# Веса и «потолки» сигналов (насыщение: 20 жилых домов не лучше 10).
WEIGHTS = {"transit": 1.2, "residential": 1.0, "food": 0.9, "offices": 0.8, "family": 0.7}
CAPS = {"transit": 8, "residential": 10, "food": 8, "offices": 8, "family": 6}


# ------------------------------------------------------------------ ошибки
class MatcherError(RuntimeError):
    pass


class CityNotSupported(MatcherError):
    def __init__(self, city: str):
        super().__init__(
            f"Город «{city}» не поддерживается. Доступны: {', '.join(sorted(CITY_BBOX))}. "
            "Крупные агломерации (Москва, СПб) пока вне покрытия: bbox слишком велик для публичного Overpass."
        )


class NicheNotSupported(MatcherError):
    def __init__(self, niche: str):
        super().__init__(f"Ниша «{niche}» неизвестна Matcher'у (нет в каталоге скоринга).")


class InsufficientData(MatcherError):
    def __init__(self, got: int):
        super().__init__(
            f"Данных слишком мало: Overpass вернул {got} точек (минимум {MIN_POINTS}). "
            "Возможно, bbox задевает промзону или API отдал усечённый ответ — попробуйте позже."
        )


class UpstreamUnavailable(MatcherError):
    def __init__(self, cause: str):
        super().__init__(f"Overpass недоступен ({cause}), а кэша по городу+нише нет. Повторите через минуту.")


# ------------------------------------------------------------------ сетка
def _grid_steps(bbox: BBox, cell_meters: int) -> Tuple[float, float]:
    """Шаг сетки в градусах: по широте фиксирован, по долготе — с учётом cos(lat)."""
    south, west, north, east = bbox
    lat_step = cell_meters / 111_320.0
    mid_lat = math.radians((south + north) / 2.0)
    lon_step = cell_meters / (111_320.0 * math.cos(mid_lat))
    return lat_step, lon_step


def _cell_of(lat: float, lon: float, bbox: BBox, lat_step: float, lon_step: float) -> Tuple[int, int]:
    south, west, _, _ = bbox
    row = int((lat - south) / lat_step)
    col = int((lon - west) / lon_step)
    return row, col


def _nearest_district(city: str, lat: float, lon: float) -> Optional[str]:
    centroids = DISTRICT_CENTROIDS.get(city)
    if not centroids:
        return None
    best, best_d = None, float("inf")
    for name, clat, clon in centroids:
        d = math.hypot(clat - lat, clon - lon)
        if d < best_d:
            best, best_d = name, d
    return best if best_d < 0.06 else None  # ~4-6 км, дальше — «вне района»


# ------------------------------------------------------- классификация точки
def _is_competitor(tags: Dict[str, str], selectors: List[Selector]) -> bool:
    return any(all(tags.get(k) == v if v is not None else k in tags for k, v in sel.items()) for sel in selectors)


def _signal_bucket(tags: Dict[str, str]) -> Optional[str]:
    """Корзина спроса для точки (прямые конкуренты сюда уже не попадают)."""
    if tags.get("amenity") in FOOD_TAGS:
        return "food"
    if "office" in tags:
        return "offices"
    if tags.get("building") in RESIDENTIAL_TAGS:
        return "residential"
    if tags.get("highway") == "bus_stop" or tags.get("railway") in TRANSIT_RAIL:
        return "transit"
    if tags.get("amenity") in FAMILY_TAGS:
        return "family"
    return None


# ------------------------------------------------------------- ядро скоринга
def compute_cells(points: List[Dict], niche_id: str, city: str,
                  cell_meters: int = 500, limit: int = 5) -> Dict[str, Any]:
    """
    Точки (любого источника: Overpass или демо-генератор) -> сетка, скоры,
    топ-подборка. Чистая функция — на ней же работает scripts/demo_matcher.py.
    """
    city_def = CITY_BBOX[city]
    bbox: BBox = city_def["bbox"]
    comp_selectors = COMPETITOR_TAGS[niche_id]

    lat_step, lon_step = _grid_steps(bbox, cell_meters)
    rows = max(1, math.ceil((bbox[2] - bbox[0]) / lat_step))
    cols = max(1, math.ceil((bbox[3] - bbox[1]) / lon_step))

    grid: Dict[Tuple[int, int], Dict[str, Any]] = {}
    competitors_total = 0

    for p in points:
        lat, lon, tags = p["lat"], p["lon"], p["tags"]
        if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]):
            continue
        key = _cell_of(lat, lon, bbox, lat_step, lon_step)
        cell = grid.setdefault(
            key,
            {"competitors": 0, "signals": {"food": 0, "offices": 0, "residential": 0, "transit": 0, "family": 0}},
        )
        if _is_competitor(tags, comp_selectors):
            cell["competitors"] += 1
            competitors_total += 1
            continue  # прямой конкурент не считается своим же сигналом спроса
        bucket = _signal_bucket(tags)
        if bucket:
            cell["signals"][bucket] += 1

    # opportunity = взвешенный спрос / (1 + конкуренты), нормировка на максимум
    scored: List[Dict[str, Any]] = []
    best_opp = 0.0
    for (row, col), cell in grid.items():
        raw = sum(WEIGHTS[s] * min(cell["signals"][s], CAPS[s]) for s in WEIGHTS)
        if raw <= 0:
            continue
        opp = raw / (1 + cell["competitors"])
        best_opp = max(best_opp, opp)
        scored.append({"row": row, "col": col, "raw": raw, "opp": opp, **cell})

    if best_opp <= 0:
        return _empty_result(city, niche_id, cell_meters, len(points), rows * cols, competitors_total)

    cells_out: List[Dict[str, Any]] = []
    for item in scored:
        lat = bbox[0] + (item["row"] + 0.5) * lat_step
        lon = bbox[1] + (item["col"] + 0.5) * lon_step
        cells_out.append(
            {
                "id": f"r{item['row']}-c{item['col']}",
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "score": round(item["opp"] / best_opp * 100, 1),
                "competitors": item["competitors"],
                "signals": item["signals"],
                "district": _nearest_district(city, lat, lon),
            }
        )
    cells_out.sort(key=lambda c: c["score"], reverse=True)

    top = cells_out[:limit]
    for place, cell in enumerate(top, start=1):
        cell["reason"] = _reason(cell, place)

    return {
        "city": city,
        "city_name": city_def["name"],
        "niche": niche_id,
        "niche_title": NICHES_BY_ID[niche_id]["title"],
        "cell_meters": cell_meters,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stats": {
            "cells_total": rows * cols,
            "cells_scored": len(cells_out),
            "points_total": len(points),
            "competitors": competitors_total,
        },
        "top": top,
        "cells": cells_out[:MAX_CELLS_IN_RESPONSE],  # пустые не отдаём — карта и так всё покажет
    }


def _empty_result(city, niche_id, cell_meters, points, cells_total, competitors) -> Dict[str, Any]:
    return {
        "city": city,
        "city_name": CITY_BBOX[city]["name"],
        "niche": niche_id,
        "niche_title": NICHES_BY_ID[niche_id]["title"],
        "cell_meters": cell_meters,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stats": {"cells_total": cells_total, "cells_scored": 0, "points_total": points, "competitors": competitors},
        "top": [],
        "cells": [],
    }


def _reason(cell: Dict[str, Any], place: int) -> str:
    s = cell["signals"]
    strongest = max(s, key=s.get)
    label = {
        "transit": "транспортный трафик",
        "residential": "плотная жилая застройка",
        "food": "сложившийся общепит — люди уже ходят сюда",
        "offices": "офисный спрос в обеденные часы",
        "family": "семейная аудитория рядом",
    }[strongest]
    comp = cell["competitors"]
    comp_txt = "прямых конкурентов в ячейке нет" if comp == 0 else f"прямых конкурентов: {comp}"
    return f"Топ-{place}: {label}; {comp_txt}."


# --------------------------------------------------------------------- кэш
def _is_fresh(created_at: Optional[datetime], ttl_days: Optional[int]) -> bool:
    """Свежесть снимка считаем в Python — одинаково для SQLite и Postgres
    (julianday() есть только в SQLite, теперь не нужна)."""
    if created_at is None:
        return False
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - created_at) <= timedelta(days=ttl_days or SNAPSHOT_TTL_DAYS)


def save_snapshot(city: str, niche_id: str, payload: Dict[str, Any]) -> None:
    with SessionLocal() as session:
        session.add(
            LocationSnapshot(
                city=city,
                niche_id=niche_id,
                payload=json.dumps(payload, ensure_ascii=False),
                ttl_days=SNAPSHOT_TTL_DAYS,
            )
        )
        session.commit()
    logger.info("Кэш локаций сохранён: %s/%s", city, niche_id)


def load_snapshot(city: str, niche_id: str, fresh_only: bool) -> Optional[Dict[str, Any]]:
    with SessionLocal() as session:
        row = (
            session.query(LocationSnapshot)
            .filter(LocationSnapshot.city == city, LocationSnapshot.niche_id == niche_id)
            .order_by(LocationSnapshot.id.desc())
            .first()
        )
        if row is None:
            return None
        fresh = _is_fresh(row.created_at, row.ttl_days)
        if fresh_only and not fresh:
            return None
        payload = json.loads(row.payload)
        cache_created_at = row.created_at.isoformat() if row.created_at else None

    payload["source"] = "cache" if fresh else "cache_stale"
    payload["cache_created_at"] = cache_created_at
    return payload


# ------------------------------------------------------------- публичный API
def supported_cities() -> List[Dict[str, Any]]:
    return [{"key": k, "name": v["name"], "cell_meters": 500} for k, v in CITY_BBOX.items()]


def match_locations(niche_id: str, city: str, limit: int = 5,
                    cell_meters: int = 500, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Полный цикл: валидация -> кэш -> Overpass (один запрос) -> скоринг -> кэш.
    Исключения MatcherError маппятся в main.py на HTTP-коды.
    """
    if city not in CITY_BBOX:
        raise CityNotSupported(city)
    if niche_id not in NICHES_BY_ID or niche_id not in COMPETITOR_TAGS:
        raise NicheNotSupported(niche_id)

    # 1) свежий кэш (TTL 7 дней) — городской запрос слишком дорогой, чтобы ходить зря
    if not force_refresh:
        cached = load_snapshot(city, niche_id, fresh_only=True)
        if cached is not None:
            logger.info("Matcher: кэш свежий (%s/%s)", city, niche_id)
            return cached

    # 2) один запрос: конкуренты ниши + все сигналы спроса разом
    try:
        points = fetch_elements(COMPETITOR_TAGS[niche_id] + SIGNAL_SELECTORS, CITY_BBOX[city]["bbox"])
    except OverpassError as exc:
        stale = load_snapshot(city, niche_id, fresh_only=False)
        if stale is not None:
            logger.warning("Matcher: Overpass недоступен (%s) — отдаю stale-кэш", exc)
            stale["note"] = "Overpass временно недоступен: показан последний кэшированный снимок."
            return stale
        raise UpstreamUnavailable(str(exc)) from exc

    if len(points) < MIN_POINTS:
        raise InsufficientData(len(points))

    result = compute_cells(points, niche_id, city, cell_meters=cell_meters, limit=limit)
    result["source"] = "overpass"

    # 3) пишем кэш только если есть что кэшировать
    if result["stats"]["cells_scored"] > 0:
        save_snapshot(city, niche_id, result)
    return result
