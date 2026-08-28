"""
BizRadar · Finance — детерминированная юнит-экономика точки.

Внешних API нет: чистая математика поверх наших данных (ниша + регион).
Формулы зафиксированы продуктовой спецификацией и НЕ должны меняться:

    выручка/мес            = чек × клиентов/день × дней
    валовая прибыль        = выручка × маржа/100
    постоянные расходы     = аренда + ФОТ + прочие
    прибыль/мес            = валовая прибыль − постоянные
    безубыточность (выр.)  = постоянные / (маржа/100)
    безубыточность (кл/д)  = ТО_выручка / чек / дней
    окупаемость (мес)      = инвестиции / прибыль        (только при прибыль > 0)
    рентабельность (%)     = прибыль / выручка × 100

ПРЕФИЛЛ: осмысленные значения по нише (средний чек, поток, маржа, аренда,
ФОТ, инвестиции — откалиброваны под каталог скоринга) + региональная поправка
по данным Росстата (таблица region_stats, fallback — статичный справочник):

    k       = доход_региона / 48 500 (Томск — базис), ограничен [0.75; 2.0]
    аренда, ФОТ, прочие  ×= k          (издержки следуют за уровнем доходов)
    средний чек          ×= √k         (частичный перенос ценового уровня;
                                        спрос сознательно не масштабируем —
                                        консервативная оценка)
"""

from __future__ import annotations

import math
from typing import Any, Dict, Optional

from parsers.region_stats import get_region_stats

# Томск — опорный город каталога; его доход принят за базис поправки.
BASE_INCOME = 48_500

# Ключи параметров модели (единый порядок: форма, API, пресеты).
PARAM_KEYS = (
    "avg_check",        # средний чек, ₽
    "clients_per_day",  # клиентов в день
    "days_per_month",   # рабочих дней в месяце
    "margin_pct",       # маржа, % выручки после переменных затрат
    "rent",             # аренда, ₽/мес
    "staff",            # фонд оплаты труда, ₽/мес
    "other_fixed",      # прочие постоянные, ₽/мес
    "investment",       # стартовые инвестиции, ₽
)

# ---------------------------------------------------------------------------
# Пресеты по нишам: чек, клиенты/день, дни, маржа, аренда, ФОТ, прочие,
# инвестиции. Откалиброваны так, что ниши с высоким скорингом дают окупаемость
# 10–24 мес, средние — 24–48 мес, слабые (солярий, одежда, аптека, кофейня
# полного цикла, детсад) — честный «не окупается» при базовых параметрах.
# ---------------------------------------------------------------------------
FINANCE_DEFAULTS: Dict[str, Dict[str, float]] = {
    "coffee":       {"avg_check": 290,   "clients_per_day": 56, "days_per_month": 26, "margin_pct": 62, "rent": 60_000,  "staff": 88_000,  "other_fixed": 26_000, "investment": 1_400_000},
    "coffee_house": {"avg_check": 640,   "clients_per_day": 37, "days_per_month": 26, "margin_pct": 45, "rent": 150_000, "staff": 160_000, "other_fixed": 50_000, "investment": 4_800_000},
    "pizzeria":     {"avg_check": 890,   "clients_per_day": 36, "days_per_month": 26, "margin_pct": 48, "rent": 110_000, "staff": 145_000, "other_fixed": 38_000, "investment": 3_200_000},
    "shawarma":     {"avg_check": 260,   "clients_per_day": 52, "days_per_month": 26, "margin_pct": 58, "rent": 40_000,  "staff": 75_000,  "other_fixed": 20_000, "investment": 900_000},
    "nails":        {"avg_check": 1450,  "clients_per_day": 12, "days_per_month": 26, "margin_pct": 66, "rent": 50_000,  "staff": 135_000, "other_fixed": 22_000, "investment": 1_100_000},
    "barber":       {"avg_check": 1100,  "clients_per_day": 18, "days_per_month": 26, "margin_pct": 55, "rent": 65_000,  "staff": 115_000, "other_fixed": 24_000, "investment": 1_900_000},
    "lashes":       {"avg_check": 1900,  "clients_per_day": 6,  "days_per_month": 26, "margin_pct": 70, "rent": 30_000,  "staff": 90_000,  "other_fixed": 17_500, "investment": 700_000},
    "solarium":     {"avg_check": 700,   "clients_per_day": 13, "days_per_month": 26, "margin_pct": 50, "rent": 40_000,  "staff": 60_000,  "other_fixed": 30_000, "investment": 1_600_000},
    "kids_center":  {"avg_check": 800,   "clients_per_day": 22, "days_per_month": 26, "margin_pct": 42, "rent": 45_000,  "staff": 60_000,  "other_fixed": 20_000, "investment": 2_400_000},
    "robotics":     {"avg_check": 650,   "clients_per_day": 23, "days_per_month": 26, "margin_pct": 58, "rent": 40_000,  "staff": 70_000,  "other_fixed": 21_000, "investment": 1_700_000},
    "kindergarten": {"avg_check": 22000, "clients_per_day": 2,  "days_per_month": 26, "margin_pct": 30, "rent": 150_000, "staff": 230_000, "other_fixed": 40_000, "investment": 6_500_000},
    "clothes":      {"avg_check": 2400,  "clients_per_day": 8,  "days_per_month": 26, "margin_pct": 40, "rent": 100_000, "staff": 110_000, "other_fixed": 30_000, "investment": 2_800_000},
    "cosmetics":    {"avg_check": 1300,  "clients_per_day": 14, "days_per_month": 26, "margin_pct": 46, "rent": 60_000,  "staff": 80_000,  "other_fixed": 19_000, "investment": 2_100_000},
    "pet":          {"avg_check": 1150,  "clients_per_day": 14, "days_per_month": 26, "margin_pct": 38, "rent": 35_000,  "staff": 40_000,  "other_fixed": 9_000,  "investment": 1_500_000},
    "auto":         {"avg_check": 5200,  "clients_per_day": 5,  "days_per_month": 26, "margin_pct": 44, "rent": 60_000,  "staff": 100_000, "other_fixed": 17_000, "investment": 3_600_000},
    "cleaning":     {"avg_check": 3800,  "clients_per_day": 4,  "days_per_month": 26, "margin_pct": 52, "rent": 25_000,  "staff": 95_000,  "other_fixed": 13_000, "investment": 800_000},
    "dental":       {"avg_check": 6800,  "clients_per_day": 6,  "days_per_month": 26, "margin_pct": 35, "rent": 90_000,  "staff": 110_000, "other_fixed": 21_000, "investment": 7_200_000},
    "pharmacy":     {"avg_check": 850,   "clients_per_day": 27, "days_per_month": 26, "margin_pct": 25, "rent": 80_000,  "staff": 90_000,  "other_fixed": 20_000, "investment": 3_400_000},
}

# Разумные пределы — защита от деления на ноль и «случайных» вводов.
PARAM_BOUNDS: Dict[str, tuple] = {
    "avg_check": (50, 50_000),
    "clients_per_day": (0, 1_000),
    "days_per_month": (1, 31),
    "margin_pct": (1, 95),
    "rent": (0, 5_000_000),
    "staff": (0, 10_000_000),
    "other_fixed": (0, 5_000_000),
    "investment": (0, 100_000_000),
}


def _clamp(v: float, bounds: tuple) -> float:
    lo, hi = bounds
    try:
        return min(hi, max(lo, float(v)))
    except (TypeError, ValueError):
        return lo


def sanitize_params(params: Dict[str, Any]) -> Dict[str, float]:
    """Все ключи PARAM_KEYS присутствуют и в разумных пределах."""
    out: Dict[str, float] = {}
    for key in PARAM_KEYS:
        out[key] = _clamp(params.get(key, PARAM_BOUNDS[key][0]), PARAM_BOUNDS[key])
    return out


# ------------------------------------------------------------------ префилл
def build_prefill(niche_id: str, region: str) -> Dict[str, Any]:
    """
    Дефолты ниши + региональная поправка. Никогда не ходит в сеть:
    get_region_stats читает БД (загрузчик Росстата) или статичный справочник.
    """
    base = dict(FINANCE_DEFAULTS[niche_id])
    stats = get_region_stats(region)
    income = stats.get("avg_income") or BASE_INCOME

    k = min(2.0, max(0.75, income / BASE_INCOME))       # поправка издержек
    k_check = math.sqrt(k)                              # частичный перенос в чек

    params = dict(base)
    params["rent"] = round(base["rent"] * k / 1_000) * 1_000
    params["staff"] = round(base["staff"] * k / 5_000) * 5_000
    params["other_fixed"] = round(base["other_fixed"] * k / 1_000) * 1_000
    params["avg_check"] = round(base["avg_check"] * k_check / 10) * 10

    return {
        "params": params,
        "meta": {
            "region": {
                "name": stats.get("region"),
                "avg_income": stats.get("avg_income"),
                "source": stats.get("source"),
                "as_of": stats.get("as_of"),
            },
            "cost_factor": round(k, 2),
            "check_factor": round(k_check, 2),
            "note": "Аренда, ФОТ и прочие расходы масштабированы отношением дохода "
                    f"региона к базису ({BASE_INCOME:,} ₽, Томск); чек — по √коэффициента.",
        },
    }


# ------------------------------------------------------------------- расчёт
def compute_model(p: Dict[str, float]) -> Dict[str, Any]:
    """Все показатели по фиксированным формулам. Чистая функция — её же
    зеркалирует фронтенд для мгновенного пересчёта."""
    check = max(1.0, p["avg_check"])
    days = max(1.0, p["days_per_month"])
    margin = p["margin_pct"] / 100.0

    revenue = check * p["clients_per_day"] * days
    gross = revenue * margin
    fixed = p["rent"] + p["staff"] + p["other_fixed"]
    profit = gross - fixed

    bep_revenue = fixed / margin if margin > 0 else None
    bep_clients = bep_revenue / check / days if bep_revenue is not None else None
    payback = p["investment"] / profit if profit > 0 else None
    profitability = profit / revenue * 100.0 if revenue > 0 else None

    return {
        "revenue": round(revenue),
        "gross_profit": round(gross),
        "fixed_costs": round(fixed),
        "profit": round(profit),
        "breakeven_revenue": round(bep_revenue) if bep_revenue is not None else None,
        "breakeven_clients_day": round(bep_clients, 1) if bep_clients is not None else None,
        "payback_months": round(payback, 1) if payback is not None else None,
        "profitability_pct": round(profitability, 1) if profitability is not None else None,
    }


# ------------------------------------------------------------- серия 12 мес
def build_series(p: Dict[str, float], r: Dict[str, Any], months: int = 12):
    """Выручка и расходы по месяцам + накопленный денежный поток (для графика).

    Расходы/мес = переменные (выручка − валовая) + постоянные; поток одинаков
    каждый месяц, поэтому накопление линейно: −инвестиции + прибыль × мес.
    """
    expenses = r["revenue"] - r["gross_profit"] + r["fixed_costs"]
    series = []
    for m in range(1, months + 1):
        series.append({
            "month": m,
            "revenue": r["revenue"],
            "expenses": round(expenses),
            "cumulative": round(-p["investment"] + r["profit"] * m),
        })
    return series
