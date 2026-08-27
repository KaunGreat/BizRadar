"""
BizRadar · пакетный загрузчик региональной статистики Росстата.

АРХИТЕКТУРА (принципиально):
  * Росстат/ЕМИСС дёргаются ТОЛЬКО этим загрузчиком — раз в месяц, вручную
    или по крону. Никаких обращений к ним в рантайме пользовательских запросов.
  * Результат — upsert в SQLite (таблица region_stats).
  * Скоринг и эндпоинты читают БД через parsers/region_stats.py; при отсутствии
    данных срабатывает статичный справочник (parsers/static_stats.py).

ИСТОЧНИКИ (реальные, проверено):
  1) Население по МУНИЦИПАЛЬНЫМ образованиям (уровень ГОРОДА):
     - opendata-набор 7708234640-population, CSV (версии data-*.csv):
       https://rosstat.gov.ru/opendata/7708234640-population
       (загрузчик сам парсит страницу набора и берёт свежий data-*.csv —
        версия файла меняется, прямая ссылка протухает);
     - ежегодный XLSX «Численность населения РФ по муниципальным образованиям
       на 1 января»: https://rosstat.gov.ru/compendium/document/13282
       (используется вручную через --pop-file, т.к. имя файла годовое).
  2) Среднедушевые денежные доходы — ТОЛЬКО уровень СУБЪЕКТОВ РФ:
     - ЕМИСС, показатель 57039 «Среднедушевые денежные доходы населения»:
       https://fedstat.ru/indicator/57039 (кнопка «Экспорт → CSV»);
     - Росстат НЕ публикует доходы на муниципальном уровне. Для городов
       используем прокси субъекта и явно помечаем источник
       (source: «emisss-57039 (прокси субъекта)»).

ГОРОД vs ОБЛАСТЬ: продукт оперирует городами. Население берём городское
(муниципальный уровень), доходы — субъекта-родителя (см. CITY_SUBJECT),
source_note честно говорит «доход уровня субъекта (прокси)».

ЗАПУСК (из backend/):
  python -m parsers.rosstat_loader                      # скачать + загрузить
  python -m parsers.rosstat_loader --dry-run            # без записи в БД
  python -m parsers.rosstat_loader --pop-file p.csv \
         --income-file i.csv                            # локальные файлы (офлайн)
  python -m parsers.rosstat_loader --verify             # показать, что отдаст /api/regions

ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ (.env, опционально — есть дефолты):
  ROSSTAT_POPULATION_PAGE  страница opendata-набора по населению
  ROSSTAT_INCOME_URL       прямой URL CSV-экспорта ЕМИСС (57039)
  ROSSTAT_DATA_DIR         папка для скачанных файлов (офлайн-перезапуск)
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from difflib import get_close_matches
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()  # ДО импорта db: DATABASE_URL может лежать в backend/.env

from database import ensure_database  # noqa: E402
from db import SessionLocal  # noqa: E402
from models import RegionStat  # noqa: E402
from parsers.static_stats import ALIASES, CITY_SUBJECT, DISPLAY_NAMES, LEVELS  # noqa: E402

logger = logging.getLogger("bizradar.rosstat")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.getenv("ROSSTAT_DATA_DIR") or os.path.join(BACKEND_DIR, "data", "rosstat")
POPULATION_PAGE = os.getenv("ROSSTAT_POPULATION_PAGE") or "https://rosstat.gov.ru/opendata/7708234640-population"
INCOME_URL = os.getenv("ROSSTAT_INCOME_URL") or "https://fedstat.ru/indicator/57039"
TIMEOUT = 40

# ------------------------------------------------------------------- сеть
def _fetch(url: str) -> str:
    """Скачать URL (текст). urllib из stdlib — ноль новых зависимостей."""
    req = urllib.request.Request(url, headers={"User-Agent": "BizRadar/0.6 (regional-stats-loader)"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def fetch_population_csv() -> str:
    """
    Население: идём на страницу opendata-набора, находим свежий data-*.csv
    (имена версий вида data-20240101T0000.csv меняются — линковать намертво нельзя).
    Скачанный файл сохраняем в DATA_DIR для офлайн-перезапуска.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    local = os.path.join(DATA_DIR, "population_latest.csv")

    try:
        page = _fetch(POPULATION_PAGE)
        links = re.findall(r'href="([^"]*?data-\d{8}T\d{6}[^"]*?\.csv)"', page)
        if not links:
            raise RuntimeError("на странице набора не найдено data-*.csv")
        url = links[-1]  # последняя версия
        if not url.startswith("http"):
            url = POPULATION_PAGE.rstrip("/") + "/" + url.lstrip("./")
        text = _fetch(url)
        with open(local, "w", encoding="utf-8") as f:
            f.write(text)
        logger.info("Население: скачано %s (%d байт)", url, len(text))
        return text
    except Exception as exc:
        if os.path.exists(local):
            logger.warning("Население: сеть недоступна (%s) — беру локальный %s", exc, local)
            with open(local, encoding="utf-8") as f:
                return f.read()
        raise


def fetch_income_csv() -> str:
    """Доходы субъектов: прямой CSV-экспорт ЕМИСС (URL из .env) + локальный кэш."""
    os.makedirs(DATA_DIR, exist_ok=True)
    local = os.path.join(DATA_DIR, "income_latest.csv")
    try:
        text = _fetch(INCOME_URL)
        with open(local, "w", encoding="utf-8") as f:
            f.write(text)
        logger.info("Доходы: скачано %s (%d байт)", INCOME_URL, len(text))
        return text
    except Exception as exc:
        if os.path.exists(local):
            logger.warning("Доходы: сеть недоступна (%s) — беру локальный %s", exc, local)
            with open(local, encoding="utf-8") as f:
                return f.read()
        raise


# --------------------------------------------------------------- парсинг
def _parse_stat_csv(text: str, value_hint: str) -> List[Dict]:
    """
    Толерантный парсер CSV Росстата/ЕМИСС: сам определяет разделитель,
    колонку названия и колонку значения (по подсказке), год — из заголовка.
    Возвращает [{name, value, as_of}, ...].
    """
    text = text.lstrip("\ufeff")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []
    delim = ";" if lines[0].count(";") >= lines[0].count(",") else ","
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))

    header_idx, name_col, val_col, year = None, None, None, None
    for i, row in enumerate(rows[:10]):
        low = [c.lower() for c in row]
        jn = next((j for j, c in enumerate(low) if any(k in c for k in ("наименование", "муниципальн", "территори", "субъект"))), None)
        jv = next((j for j, c in enumerate(low) if value_hint in c), None)
        if jn is not None and jv is not None:
            header_idx, name_col, val_col = i, jn, jv
            m = re.search(r"(20\d\d)", "".join(low))
            year = m.group(1) if m else None
            break
    if header_idx is None:
        raise ValueError(f"CSV не распознан: нет колонок названия и «{value_hint}»")

    out: List[Dict] = []
    for row in rows[header_idx + 1:]:
        if len(row) <= max(name_col, val_col):
            continue
        name, raw = row[name_col].strip(), row[val_col].strip().replace("\u00a0", "").replace(" ", "")
        if not name or not raw or any(sk in name.lower() for sk in ("итого", "всего по", "российская федерация")):
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        out.append({"name": name, "value": value, "as_of": f"{year or '????'}-01-01"})
    return out


# ------------------------------------------------------------- матчинг
def _normalize(s: str) -> str:
    s = s.lower().replace("ё", "е")
    s = re.sub(r"[«»\"'.,\-—()]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


_ALIAS_INDEX: Dict[str, str] = {}
for key, names in ALIASES.items():
    for n in names:
        _ALIAS_INDEX[_normalize(n)] = key
        _ALIAS_INDEX[key.replace("_", " ")] = key


def match_region(raw_name: str) -> Optional[str]:
    """'Муниципальное образование «Город Томск»' -> 'tomsk'. None, если не нашли."""
    norm = _normalize(raw_name)
    if norm in _ALIAS_INDEX:
        return _ALIAS_INDEX[norm]
    # отбрасываем родовые слова — частый случай «город Томск» с регистром/падежом
    slim = re.sub(r"\b(город|г|муниципальное|образование|муниципальный|район)\b", " ", norm)
    slim = re.sub(r"\s+", " ", slim).strip()
    if slim in _ALIAS_INDEX:
        return _ALIAS_INDEX[slim]
    candidates = get_close_matches(slim, _ALIAS_INDEX.keys(), n=1, cutoff=0.86)
    return _ALIAS_INDEX[candidates[0]] if candidates else None


# ----------------------------------------------------------------- БД
def upsert_region(session, key: str, *, population: Optional[float] = None,
                  avg_income: Optional[float] = None, as_of: Optional[str] = None,
                  source: str = "rosstat") -> None:
    """Переносимый upsert (select + update/insert) — без диалект-специфичного
    ON CONFLICT, работает и на SQLite, и на Postgres.

    Семантика COALESCE сохранена: новое значение затирает старое, только если
    оно не None (частичные обновления не обнуляют уже загруженные поля).
    """
    row = session.query(RegionStat).filter(RegionStat.region_key == key).first()
    name = DISPLAY_NAMES.get(key, key)
    level = LEVELS.get(key, "subject")
    subject = CITY_SUBJECT.get(key)
    if row is None:
        row = RegionStat(
            region_key=key,
            region_name=name,
            level=level,
            subject_key=subject,
            population=int(population) if population is not None else None,
            avg_income=int(avg_income) if avg_income is not None else None,
            as_of=as_of,
            source=source,
        )
        session.add(row)
    else:
        row.region_name = name
        row.level = level
        row.subject_key = subject
        if population is not None:
            row.population = int(population)
        if avg_income is not None:
            row.avg_income = int(avg_income)
        if as_of is not None:
            row.as_of = as_of
        row.source = source
    row.updated_at = datetime.now(timezone.utc)


# ---------------------------------------------------------------- main
def run(pop_file: Optional[str], income_file: Optional[str], dry_run: bool) -> int:
    ensure_database()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ok_sources, unmatched = 0, []

    session = SessionLocal()
    try:
        # ---------- 1) население (городской уровень) ----------
        try:
            text = open(pop_file, encoding="utf-8").read() if pop_file else fetch_population_csv()
            rows = _parse_stat_csv(text, "численн")
            matched = 0
            for r in rows:
                key = match_region(r["name"])
                if key is None:
                    if len(unmatched) < 30:
                        unmatched.append(r["name"])
                    continue
                # нас интересуют только города продукта и их субъекты
                if key not in DISPLAY_NAMES:
                    continue
                if LEVELS.get(key) != "city":
                    continue
                matched += 1
                if not dry_run:
                    upsert_region(session, key, population=r["value"], as_of=r["as_of"], source="rosstat-opendata")
            logger.info("Население: строк %d, сматчено городов %d", len(rows), matched)
            ok_sources += 1
        except Exception as exc:
            logger.error("Население: источник недоступен или не распознан: %s", exc)

        # ---------- 2) доходы (уровень субъектов) ----------
        try:
            text = open(income_file, encoding="utf-8").read() if income_file else fetch_income_csv()
            rows = _parse_stat_csv(text, "доход")
            matched = 0
            for r in rows:
                key = match_region(r["name"])
                if key is None:
                    if len(unmatched) < 60:
                        unmatched.append(r["name"])
                    continue
                if key not in DISPLAY_NAMES or LEVELS.get(key) != "subject":
                    continue
                matched += 1
                if not dry_run:
                    upsert_region(session, key, avg_income=r["value"], as_of=r["as_of"], source="emisss-57039")
            logger.info("Доходы: строк %d, сматчено субъектов %d", len(rows), matched)
            ok_sources += 1
        except Exception as exc:
            logger.error("Доходы: источник недоступен или не распознан: %s", exc)

        # ---------- 3) прокси: городам — доход их субъекта ----------
        try:
            for city, subj in CITY_SUBJECT.items():
                if city == subj:  # Москва: доход уже записан как субъекту
                    continue
                subj_row = session.query(RegionStat).filter(RegionStat.region_key == subj).first()
                if subj_row and subj_row.avg_income and not dry_run:
                    upsert_region(session, city, avg_income=subj_row.avg_income, as_of=subj_row.as_of,
                                  source="emisss-57039 (прокси субъекта)")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Прокси доходов: %s", exc)

        if not dry_run:
            session.commit()
    finally:
        session.close()

    if unmatched:
        path = os.path.join(DATA_DIR, f"unmatched_{now.replace('-', '')}.txt")
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(unmatched))
        logger.warning("Не сматчено %d территорий (примеры сохранены в %s): %s",
                       len(unmatched), path, "; ".join(unmatched[:5]))

    logger.info("Готово%s: источников ок=%d/2, unmatched=%d", " (dry-run)" if dry_run else "", ok_sources, len(unmatched))
    return 0 if ok_sources else 2


def verify() -> int:
    from parsers.region_stats import get_region_stats  # локальный импорт: не нужен при загрузке

    for city in CITY_SUBJECT:
        s = get_region_stats(city)
        print(f"{s['region']:<12} население={str(s['population']):>10}  доход={str(s['avg_income']):>7}  "
              f"as_of={s['as_of']}  source={s['source']}")
    return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(description="Пакетный загрузчик статистики Росстата/ЕМИСС в БД BizRadar")
    p.add_argument("--dry-run", action="store_true", help="парсинг и матчинг без записи в БД")
    p.add_argument("--pop-file", help="локальный CSV по населению (вместо скачивания)")
    p.add_argument("--income-file", help="локальный CSV по доходам (вместо скачивания)")
    p.add_argument("--verify", action="store_true", help="показать, что сейчас отдаст /api/regions")
    args = p.parse_args()

    if args.verify:
        return verify()
    return run(args.pop_file, args.income_file, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
