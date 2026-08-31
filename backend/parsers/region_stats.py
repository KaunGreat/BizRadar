"""
BizRadar · чтение региональной статистики (рантайм — БЕЗ сети).

Порядок источников:
  1) таблица region_stats (заполняется пакетным загрузчиком раз в месяц);
  2) для города без дохода — доход субъекта-родителя (официальное прокси,
     т.к. Росстат не публикует муниципальные доходы);
  3) статичный справочник parsers/static_stats.py — если данных ещё нет.

Сигнатуры, которые использует скоринг и эндпоинты, не менялись:
  get_region_stats(name_or_key) -> dict
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from db import SessionLocal
from models import RegionStat
from parsers.static_stats import (
    ALIASES,
    CITY_SUBJECT,
    DISPLAY_NAMES,
    LEVELS,
    STATIC_REGIONS,
)

logger = logging.getLogger("bizradar.regions")


def _resolve_key(name_or_key: str) -> Optional[str]:
    s = name_or_key.strip().lower().replace("ё", "е")
    if s in DISPLAY_NAMES or s in CITY_SUBJECT:
        return s
    s2 = s.replace(".", "").replace(",", "")
    for key, names in ALIASES.items():
        if s2 in [n.lower().replace(".", "") for n in names]:
            return key
    return None


def _db_row(key: str) -> Optional[Dict[str, Any]]:
    try:
        with SessionLocal() as session:
            row = session.query(RegionStat).filter(RegionStat.region_key == key).first()
            if row is None:
                return None
            return {
                "region_key": row.region_key,
                "region_name": row.region_name,
                "level": row.level,
                "subject_key": row.subject_key,
                "population": row.population,
                "avg_income": row.avg_income,
                "as_of": row.as_of,
                "source": row.source,
            }
    except Exception as exc:  # noqa: BLE001 — БД недоступна → статичный справочник
        logger.warning("БД недоступна (%s) — читаю статичный справочник", exc)
        return None


def get_region_stats(name_or_key: str) -> Dict[str, Any]:
    """
    Демография региона/города: население, среднедушевой доход, дата актуальности
    и источник — для бейджа на фронтенде. Никогда не ходит в сеть.
    """
    key = _resolve_key(name_or_key)
    if key is None:
        return {
            "region": name_or_key,
            "level": "unknown",
            "population": None,
            "avg_income": None,
            "as_of": None,
            "source": "unknown-region",
            "source_note": "территория не найдена ни в БД, ни в справочнике",
        }

    row = _db_row(key)
    if row and (row.get("population") is not None or row.get("avg_income") is not None):
        result: Dict[str, Any] = {
            "region": DISPLAY_NAMES.get(key, key),
            "region_key": key,
            "level": row.get("level") or LEVELS.get(key, "subject"),
            "population": row.get("population"),
            "avg_income": row.get("avg_income"),
            "as_of": row.get("as_of"),
            "source": row.get("source") or "rosstat",
            "source_note": "пакетная загрузка Росстат/ЕМИСС",
        }
        # городу без дохода — прокси субъекта
        if result["avg_income"] is None and CITY_SUBJECT.get(key):
            subj = CITY_SUBJECT[key]
            srow = _db_row(subj)
            if srow and srow.get("avg_income") is not None:
                result["avg_income"] = srow["avg_income"]
                result["source_note"] = f"доход — уровень субъекта ({DISPLAY_NAMES.get(subj, subj)}), официальное прокси"
                result["source"] = f"{result['source']} + прокси субъекта"
        return result

    # ---------- fallback: статичный справочник ----------
    static = STATIC_REGIONS.get(key, {})
    return {
        "region": DISPLAY_NAMES.get(key, key),
        "region_key": key,
        "level": LEVELS.get(key, "subject"),
        "population": static.get("population"),
        "avg_income": static.get("avg_income"),
        "as_of": static.get("as_of"),
        "source": "static-fallback",
        "source_note": "данные Росстата ещё не загружены — использован статичный справочник (запустите python -m parsers.rosstat_loader)",
    }


def list_regions() -> List[Dict[str, Any]]:
    """Все известные территории: города продукта + субъекты (БД поверх справочника)."""
    return [get_region_stats(key) for key in DISPLAY_NAMES]
