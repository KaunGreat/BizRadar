"""
BizRadar · FastAPI — модульный монолит (точка входа).

Эндпоинты:
  GET  /api/health               — статус сервиса, БД и LLM-провайдера
  GET  /api/niches               — каталог ниш со скорингом
  GET  /api/niches/{niche_id}    — детальная карточка ниши
  POST /api/report               — бизнес-отчёт (GigaChat, fallback на заглушку)

Бизнес-логика (скоринг, генерация отчётов) живёт в services/ — здесь только
клей: маршруты, Pydantic-контракты и бутстрап SQLite из DATABASE_PATH.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from catalog import NICHES, NICHES_BY_ID
from database import DATABASE_PATH, ensure_database
from services.ai_service import RussianLLMService

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
    return niche


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
