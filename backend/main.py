"""
BizRadar · FastAPI — модульный монолит (точка входа).

Эндпоинты:
  GET  /api/health                    — статус сервиса, БД и LLM-провайдера
  GET  /api/niches                    — каталог ниш со скорингом
  GET  /api/niches/{niche_id}         — детальная карточка ниши
  POST /api/report                    — бизнес-отчёт (GigaChat, fallback на заглушку)
  GET  /api/v1/match-locations/cities — города, поддерживаемые Matcher'ом
  POST /api/v1/match-locations        — подбор локаций: сетка ~500 м, скор, топ (кэш 7 дней)
  GET  /api/v1/projects               — история анализов (обратная хронология)
  POST /api/v1/projects               — сохранить анализ (снимок метрик + отчёт)
  GET  /api/v1/projects/{id}          — сохранённый анализ целиком
  DELETE /api/v1/projects/{id}        — удалить запись из истории

Бизнес-логика (скоринг, генерация отчётов) живёт в services/ — здесь только
клей: маршруты, Pydantic-контракты и бутстрап SQLite из DATABASE_PATH.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from catalog import NICHES, NICHES_BY_ID
from database import DATABASE_PATH, ensure_database
from parsers.region_stats import get_region_stats, list_regions
from schemas import MatchLocationsRequest, MatchLocationsResponse, ProjectCreateRequest
from services.ai_service import RussianLLMService
from services.location_matcher import (
    CityNotSupported,
    InsufficientData,
    NicheNotSupported,
    UpstreamUnavailable,
    match_locations,
    supported_cities,
)

load_dotenv()  # локальный запуск без Docker: подтягиваем .env из backend/

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("bizradar")

llm = RussianLLMService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_database(DATABASE_PATH)
    logger.info("SQLite готова: %s", DATABASE_PATH)
    yield


app = FastAPI(title="BizRadar API", version="0.5.0", lifespan=lifespan)


# ------------------------------------------------------------------ контракты
class MarketData(BaseModel):
    competitors_count: int | float = 0
    density_per_100k: int | float = 0
    competition_level: str = "средняя"
    avg_income: int | float = 0
    budget: int | float = 0


class ReportRequest(BaseModel):
    niche: str
    region: str = "Российская Федерация"
    market_data: MarketData = MarketData()


# ------------------------------------------------------------------ маршруты
@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "bizradar-api",
        "version": app.version,
        "database": {"path": DATABASE_PATH, "exists": os.path.exists(DATABASE_PATH)},
        "llm": {
            "provider": llm.provider,
            "model": llm.model,
            "key_configured": bool(llm.auth_key),
        },
    }


@app.get("/api/niches")
def list_niches() -> dict:
    return {"items": NICHES, "total": len(NICHES), "cache": "MarketSnapshot · TTL 7 дней"}


@app.get("/api/niches/{niche_id}")
def get_niche(niche_id: str) -> dict:
    niche = NICHES_BY_ID.get(niche_id)
    if niche is None:
        raise HTTPException(status_code=404, detail=f"ниша «{niche_id}» не найдена")
    # Демография опорного города (каталог откалиброван на Томск) — из БД,
    # заполненной пакетным загрузчиком; source + as_of идут в бейдж фронтенда.
    # При пустой БД get_region_stats сама упадёт на статичный справочник.
    demo = get_region_stats("tomsk")
    return {
        **niche,
        "demographics": {
            "region": demo["region"],
            "population": demo["population"],
            "avg_income": demo["avg_income"],
            "as_of": demo["as_of"],
            "source": demo["source"],
            "source_note": demo.get("source_note"),
        },
    }


@app.post("/api/report")
def create_report(req: ReportRequest) -> dict:
    """Контракт неизменен: внутри — generate_business_report(niche, region, market_data)."""
    report = llm.generate_business_report(req.niche, req.region, req.market_data.model_dump())
    return {
        "niche": req.niche,
        "region": req.region,
        "source": llm.last_report_source,  # "gigachat" | "stub"
        "report": report,
    }


# -------------------------------------------------- Региональная статистика
@app.get("/api/regions")
def regions_api(city: str | None = None) -> dict:
    """
    Демография региона/города: население, среднедушевой доход, дата актуальности
    и источник (source/as_of — для бейджа на фронтенде).

    Данные читаются ТОЛЬКО из БД (пакетный загрузчик Росстат/ЕМИСС, раз в месяц);
    при отсутствии данных — статичный справочник (source: static-fallback).
    В рантайме запросов к Росстату нет.
    """
    if city:
        return {"item": get_region_stats(city)}
    return {"items": list_regions(), "cache": "загрузчик Росстат/ЕМИСС · раз в месяц"}


# ------------------------------------------------------- Matcher (v1 API)
@app.get("/api/v1/match-locations/cities")
def matcher_cities() -> dict:
    """Города в покрытии Matcher'а (bbox + ячейка 500 м)."""
    return {"items": supported_cities()}


@app.post("/api/v1/match-locations", response_model=MatchLocationsResponse)
def match_locations_route(req: MatchLocationsRequest) -> MatchLocationsResponse:
    """
    Подбор конкретной локации: сетка ~500 м по городу, скор каждой ячейки
    (сигналы спроса / (1 + конкуренты)), топ-подборка с пояснениями.

    Источники ответа: overpass -> cache (TTL 7 дней) -> cache_stale (при сбое
    Overpass). Бизнес-логика скоринга ниш НЕ затронута.
    """
    try:
        result = match_locations(
            niche_id=req.niche,
            city=req.city,
            limit=req.limit,
            cell_meters=req.cell_meters,
            force_refresh=req.force_refresh,
        )
    except (CityNotSupported, NicheNotSupported) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InsufficientData, UpstreamUnavailable) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return MatchLocationsResponse(**result)


# ------------------------------------------------- История анализов (проекты)
@app.get("/api/v1/projects")
def list_projects() -> dict:
    """Сохранённые анализы в обратном хронологическом порядке (со снимком метрик)."""
    with sqlite3.connect(DATABASE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM projects ORDER BY id DESC LIMIT 200"
        ).fetchall()
    items = [
        {
            "id": r["id"],
            "niche_id": r["niche_id"],
            "niche_title": r["niche_title"],
            "city": r["city"],
            "city_name": r["city_name"],
            "score": r["score"],
            "survival": r["survival"],
            "has_report": bool(r["has_report"]),
            "created_at": r["created_at"],
            "snapshot": json.loads(r["snapshot"]),
        }
        for r in rows
    ]
    return {"items": items, "total": len(items)}


@app.get("/api/v1/projects/{project_id}")
def get_project(project_id: int) -> dict:
    with sqlite3.connect(DATABASE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        r = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if r is None:
        raise HTTPException(status_code=404, detail=f"анализ №{project_id} не найден")
    return {
        "id": r["id"],
        "niche_id": r["niche_id"],
        "niche_title": r["niche_title"],
        "city": r["city"],
        "city_name": r["city_name"],
        "score": r["score"],
        "survival": r["survival"],
        "has_report": bool(r["has_report"]),
        "created_at": r["created_at"],
        "snapshot": json.loads(r["snapshot"]),
    }


@app.post("/api/v1/projects", status_code=201)
def create_project(req: ProjectCreateRequest) -> dict:
    """Сохранить анализ: город, ниша, скор + снимок метрик и отчёт (без повторного парсинга при открытии)."""
    title = req.niche_title or (NICHES_BY_ID.get(req.niche_id) or {}).get("title", req.niche_id)
    snapshot = req.snapshot or {}
    has_report = 1 if snapshot.get("report") else 0
    with sqlite3.connect(DATABASE_PATH) as conn:
        cur = conn.execute(
            """
            INSERT INTO projects (niche_id, niche_title, city, city_name, score, survival, has_report, snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                req.niche_id, title, req.city, req.city_name,
                req.score, req.survival, has_report,
                json.dumps(snapshot, ensure_ascii=False),
            ),
        )
        project_id = cur.lastrowid
        row = conn.execute("SELECT created_at FROM projects WHERE id = ?", (project_id,)).fetchone()
    return {"id": project_id, "created_at": row[0], "has_report": bool(has_report)}


@app.delete("/api/v1/projects/{project_id}")
def delete_project(project_id: int) -> dict:
    with sqlite3.connect(DATABASE_PATH) as conn:
        cur = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"анализ №{project_id} не найден")
    return {"deleted": project_id}
