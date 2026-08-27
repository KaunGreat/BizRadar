"""
Офлайн-демо модуля Matcher: прогоняет весь скоринг локаций на синтетических
точках (без сети — Overpass не вызывается). Полезно для CI и проверки
математики: сетка, веса сигналов, формула opportunity, топ-подборка.

Запуск:  python backend/scripts/demo_matcher.py
"""

import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.location_matcher import (  # noqa: E402
    CITY_BBOX,
    DISTRICT_CENTROIDS,
    compute_cells,
)

def synth_points(city: str) -> list:
    """Детерминированный синтетический город: жильё в районах, транспорт по
    двум «проспектам», общепит и офисы у центроидов, конкуренты в центре."""
    rnd = random.Random(42)
    south, west, north, east = CITY_BBOX[city]["bbox"]
    points = []

    def add(lat, lon, tags):
        points.append({"lat": round(lat, 6), "lon": round(lon, 6), "tags": tags})

    # жилые кластеры вокруг центроидов районов
    for _, clat, clon in DISTRICT_CENTROIDS.get(city, [(city, (south + north) / 2, (west + east) / 2)]):
        for _ in range(60):
            add(clat + rnd.gauss(0, 0.012), clon + rnd.gauss(0, 0.016),
                {"building": rnd.choice(["apartments", "residential"])})
        for _ in range(10):
            add(clat + rnd.gauss(0, 0.010), clon + rnd.gauss(0, 0.013),
                {"amenity": rnd.choice(["cafe", "restaurant", "fast_food"])})
        for _ in range(6):
            add(clat + rnd.gauss(0, 0.008), clon + rnd.gauss(0, 0.010), {"office": "company"})
        for _ in range(3):
            add(clat + rnd.gauss(0, 0.009), clon + rnd.gauss(0, 0.011),
                {"amenity": rnd.choice(["school", "kindergarten"])})

    # транспорт: остановки вдоль двух «проспектов»
    for i in range(28):
        t = i / 27
        add(south + (north - south) * t, west + (east - west) * (0.35 + 0.05 * rnd.random()),
            {"highway": "bus_stop"})
        add(south + (north - south) * (0.4 + 0.05 * rnd.random()), west + (east - west) * t,
            {"highway": "bus_stop"})
    add((south + north) / 2, (west + east) / 2, {"railway": "station"})

    # прямые конкуренты ниши (кофейни) — кучно в центре
    clat, clon = (south + north) / 2, (west + east) / 2
    for _ in range(14):
        add(clat + rnd.gauss(0, 0.006), clon + rnd.gauss(0, 0.008), {"amenity": "cafe"})

    return points


def main() -> None:
    city = "tomsk"
    niche = "coffee"
    points = synth_points(city)
    print(f"Синтетических точек: {len(points)} (город: {CITY_BBOX[city]['name']}, ниша: {niche})")

    result = compute_cells(points, niche, city, cell_meters=500, limit=5)

    print("\n=== статистика ===")
    print(json.dumps(result["stats"], ensure_ascii=False, indent=2))

    print("\n=== топ-5 ячеек ===")
    for cell in result["top"]:
        print(
            f"  {cell['id']:>10}  score={cell['score']:>5}  competitors={cell['competitors']}  "
            f"signals={cell['signals']}  район={cell['district']}"
        )
        print(f"             {cell['reason']}")

    # контрольные инварианты скоринга
    assert result["stats"]["cells_scored"] > 0, "сетка пуста — скоринг сломан"
    assert result["top"][0]["score"] == 100.0, "максимум не нормирован на 100"
    assert all(a["score"] >= b["score"] for a, b in zip(result["top"], result["top"][1:])), "топ не отсортирован"
    assert result["stats"]["competitors"] > 0, "конкуренты не найдены — теги ниши не сматчились"

    print("\nOK: сетка построена, скоры нормированы, топ отсортирован, конкуренты учтены.")
    print("Совет: ячейки result['cells'] можно скормить Leaflet как тепловую карту.")


if __name__ == "__main__":
    main()
