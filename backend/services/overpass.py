"""
BizRadar · клиент Overpass API (OpenStreetMap).

Единственный модуль, который умеет ходить в Overpass: собирает Overpass QL
из tag-фильтров и bounding box, делает один POST-запрос, разбирает элементы
в плоский список точек {"lat", "lon", "tags"}.

Используется:
  * парсером конкурентов (нишевые теги);
  * модулем Matcher (сигналы спроса + конкуренты одним запросом на город).

Никакой бизнес-логики здесь нет — только транспорт и разбор ответа.
Таймауты и ошибки сети превращаются в OverpassTimeout / OverpassError,
а fallback-решения (кэш, 503) принимает вызывающий сервис.

Окружение:
  OVERPASS_URL      адрес интерпретатора (по умолчанию публичный)
  OVERPASS_TIMEOUT  таймаут запроса в секундах (по умолчанию 25)
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger("bizradar.overpass")

OVERPASS_URL: str = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")

try:
    DEFAULT_TIMEOUT: int = max(5, int(os.getenv("OVERPASS_TIMEOUT", "25")))
except ValueError:
    DEFAULT_TIMEOUT = 25

# (south, west, north, east)
BBox = Tuple[float, float, float, float]

# Селектор: {"amenity": "cafe"} -> ["amenity"="cafe"], {"office": None} -> ["office"]
Selector = Dict[str, Optional[str]]


class OverpassError(RuntimeError):
    """Overpass недоступен / вернул ошибку / прислал не-JSON."""


class OverpassTimeout(OverpassError):
    """Таймаут запроса (публичный Overpass на больших bbox может думать долго)."""


def tags_to_ql(selector: Selector) -> str:
    """{'amenity':'cafe','cuisine':None} -> '["amenity"="cafe"]["cuisine"]'."""
    parts = []
    for key, value in selector.items():
        if value is None:
            parts.append(f'["{key}"]')
        else:
            parts.append(f'["{key}"="{value}"]')
    return "".join(parts)


def build_query(selectors: Iterable[Selector], bbox: BBox,
                timeout: int = DEFAULT_TIMEOUT, out_limit: int = 12000) -> str:
    """
    Один Overpass QL-запрос: UNION всех селекторов в пределах bbox.
    `out center` даёт координаты центроида для ways/relations.
    """
    south, west, north, east = bbox
    bbox_str = f"{south},{west},{north},{east}"
    union = "\n  ".join(f"nwr{tags_to_ql(sel)}({bbox_str});" for sel in selectors)
    return f"[out:json][timeout:{timeout}];\n(\n  {union}\n);\nout center {out_limit};"


def fetch_elements(selectors: Iterable[Selector], bbox: BBox,
                   timeout: int = DEFAULT_TIMEOUT, out_limit: int = 12000) -> List[Dict]:
    """
    Запрашивает элементы, подходящие под ЛЮБОЙ из селекторов.

    Возвращает список точек: [{"lat": float, "lon": float, "tags": dict}, ...].
    Элементы без координат (например, relation без center) отбрасываются.

    Бросает OverpassTimeout / OverpassError — НЕ глотает их: решение
    «кэш или 503» принимает вызывающий сервис.
    """
    selector_list = list(selectors)
    query = build_query(selector_list, bbox, timeout=timeout, out_limit=out_limit)
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(
        OVERPASS_URL,
        data=body,
        headers={"User-Agent": "BizRadar/0.5 (niche analytics; contact: team@bizradar.dev)"},
        method="POST",
    )

    logger.info("Overpass: %d селекторов, bbox=%s, timeout=%ds", len(selector_list), bbox, timeout)
    try:
        with urllib.request.urlopen(request, timeout=timeout + 5) as resp:  # +5 на TCP/TLS
            if resp.status != 200:
                raise OverpassError(f"Overpass вернул HTTP {resp.status}")
            raw = resp.read()
    except TimeoutError as exc:
        raise OverpassTimeout(f"таймаут {timeout}s на bbox {bbox}") from exc
    except urllib.error.HTTPError as exc:
        raise OverpassError(f"HTTP {exc.code} от Overpass: {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise OverpassError(f"сеть недоступна: {exc.reason}") from exc

    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise OverpassError("ответ Overpass — не JSON") from exc

    points: List[Dict] = []
    for el in data.get("elements", []):
        lat, lon = el.get("lat"), el.get("lon")
        if lat is None or lon is None:  # ways/relations -> out center
            center = el.get("center") or {}
            lat, lon = center.get("lat"), center.get("lon")
        if lat is None or lon is None:
            continue
        points.append({"lat": float(lat), "lon": float(lon), "tags": el.get("tags") or {}})

    logger.info("Overpass: получено %d точек", len(points))
    return points
