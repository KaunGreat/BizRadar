"""
BizRadar · статичный справочник региональной статистики — ТОЛЬКО fallback.

Основной источник — таблица region_stats, заполняемая пакетным загрузчиком
parsers/rosstat_loader.py (раз в месяц). Словарь ниже используется, когда:
  * данные ещё не загружены (чистый деплой);
  * регион отсутствует в БД (новый город в продукте).

Значения — публичные оценки Росстата 2023–2024, округлены. Для городов доход —
прокси уровня субъекта (Росстат не публикует муниципальные доходы).
"""

from __future__ import annotations

from typing import Dict, List

# Города продукта и их субъекты (для прокси по доходам)
CITY_SUBJECT: Dict[str, str] = {
    "tomsk": "tomskaya_oblast",
    "novosibirsk": "novosibirskaya_oblast",
    "moskva": "moskva",          # Москва — город федерального значения = субъект
    "kazan": "tatarstan",
}

# Синонимы для сопоставления названий из датасетов с ключами системы
ALIASES: Dict[str, List[str]] = {
    "tomsk": ["томск", "город томск", "г томск", "г. томск", "муниципальное образование город томск", "томск город"],
    "novosibirsk": ["новосибирск", "город новосибирск", "г новосибирск", "г. новосибирск", "муниципальное образование город новосибирск"],
    "moskva": ["москва", "город москва", "г москва", "г. москва"],
    "kazan": ["казань", "город казань", "г казань", "г. казань", "муниципальное образование город казань"],
    "tomskaya_oblast": ["томская область", "томская обл", "томская обл."],
    "novosibirskaya_oblast": ["новосибирская область", "новосибирская обл", "новосибирская обл."],
    "tatarstan": ["республика татарстан", "татарстан", "респ татарстан", "респ. татарстан"],
}

DISPLAY_NAMES: Dict[str, str] = {
    "tomsk": "Томск",
    "novosibirsk": "Новосибирск",
    "moskva": "Москва",
    "kazan": "Казань",
    "tomskaya_oblast": "Томская область",
    "novosibirskaya_oblast": "Новосибирская область",
    "tatarstan": "Республика Татарстан",
}

LEVELS: Dict[str, str] = {
    "tomsk": "city",
    "novosibirsk": "city",
    "moskva": "city",
    "kazan": "city",
    "tomskaya_oblast": "subject",
    "novosibirskaya_oblast": "subject",
    "tatarstan": "subject",
}

# Статичный fallback (источник: "static-fallback")
STATIC_REGIONS: Dict[str, Dict[str, object]] = {
    "tomsk": {"population": 556_400, "avg_income": 48_500, "as_of": "2024-01-01"},
    "novosibirsk": {"population": 1_633_900, "avg_income": 52_000, "as_of": "2024-01-01"},
    "moskva": {"population": 13_104_200, "avg_income": 97_000, "as_of": "2024-01-01"},
    "kazan": {"population": 1_308_700, "avg_income": 56_000, "as_of": "2024-01-01"},
    "tomskaya_oblast": {"population": 1_058_800, "avg_income": 48_500, "as_of": "2024-01-01"},
    "novosibirskaya_oblast": {"population": 2_797_200, "avg_income": 52_000, "as_of": "2024-01-01"},
    "tatarstan": {"population": 4_001_500, "avg_income": 56_000, "as_of": "2024-01-01"},
}
