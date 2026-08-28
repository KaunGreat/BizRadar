"""
BizRadar · FastAPI — модульный монолит (точка входа).

Эндпоинты:
  GET  /api/health                    — статус сервиса, БД и LLM-провайдера
  GET  /api/niches                    — каталог ниш со скорингом
  GET  /api/niches/{niche_id}         — детальная карточка ниши
  POST /api/report                    — бизнес-отчёт (GigaChat, fallback на заглушку)
  POST /api/v1/report/pdf             — бизнес-план в PDF (Jinja2 + WeasyPrint, кириллица)
  GET  /api/v1/report/pdf/sections    — реестр секций PDF (конфиг free/premium)
  GET  /api/v1/match-locations/cities — города, поддерживаемые Matcher'ом
  POST /api/v1/match-locations        — подбор локаций: сетка ~500 м, скор, топ (кэш 7 дней)

  Аутентификация (JWT, см. services/auth.py):
  POST /api/auth/register             — регистрация (bcrypt, валидация)
  POST /api/auth/login                — вход → access_token (HS256)
  GET  /api/auth/me                   — текущий профиль (приватный)
  POST /api/auth/change-password      — смена пароля (приватный)
  POST /api/auth/logout               — выход, отзыв токена (приватный)

  «Мои анализы» — привязаны к пользователю (projects.user_id):
  GET  /api/v1/projects               — ТОЛЬКО анализы текущего пользователя
  POST /api/v1/projects               — сохранить анализ (приватный, user_id=текущий)
  GET  /api/v1/projects/{id}          — сохранённый анализ (только владелец)
  DELETE /api/v1/projects/{id}        — удалить (только владелец)

Бизнес-логика (скоринг, генерация отчётов) живёт в services/ — здесь только
клей: маршруты, Pydantic-контракты и зависимости доступа.
"""

from __future__ import annotations

import io
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv

load_dotenv()  # ДО импорта db: DATABASE_URL может лежать в backend/.env

from fastapi import Depends, FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import JSONResponse, StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from catalog import NICHES, NICHES_BY_ID  # noqa: E402
from database import ensure_database  # noqa: E402
from db import SessionLocal, is_alive, safe_url, wait_for_db  # noqa: E402
from models import MarketSnapshot, Project, User  # noqa: E402
from parsers.region_stats import get_region_stats, list_regions  # noqa: E402
from schemas import (  # noqa: E402
    ChangePasswordRequest,
    LoginRequest,
    MatchLocationsRequest,
    MatchLocationsResponse,
    PdfReportRequest,
    ProjectCreateRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from services.pdf_report import (  # noqa: E402
    PdfEngineUnavailable,
    available_sections,
    build_pdf_context,
    make_pdf_filename,
    render_business_plan_pdf,
    resolve_sections,
)
from services.ai_service import RussianLLMService  # noqa: E402
from services.audit import log_action  # noqa: E402
from services.auth import (  # noqa: E402
    JWT_EXPIRE_MINUTES,
    JWT_SECRET,
    _request_meta,
    blacklist_token,
    clear_attempts,
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_password,
    register_failed_attempt,
    too_many_attempts,
    verify_password,
)
from services.location_matcher import (  # noqa: E402
    CityNotSupported,
    InsufficientData,
    NicheNotSupported,
    UpstreamUnavailable,
    match_locations,
    supported_cities,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("bizradar")

llm = RussianLLMService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # В Docker ждём, пока Postgres поднимется (retry); для SQLite — мгновенно.
    # Схемы в контейнере уже накатил Alembic, ensure_database — идемпотентная страховка.
    wait_for_db(retries=30, delay=2.0)
    ensure_database()
    logger.info("БД готова: %s", safe_url())
    yield


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):  # noqa: ARG001
    """
    Необработанные исключения логируются в action_logs (без секретов) и
    возвращают аккуратный 500. HTTPException сюда не попадает — ошибки 4xx
    обрабатываются FastAPI штатно и не считаются сбоями.
    """
    ip, ua = _request_meta(request)
    log_action(
        "error",
        ip=ip,
        user_agent=ua,
        details={"path": request.url.path, "method": request.method, "type": type(exc).__name__},
    )
    logger.exception("Необработанное исключение на %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})


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
        # url — без пароля; path/exists оставлены для обратной совместимости с фронтендом
        "database": {"url": safe_url(), "path": safe_url(), "exists": is_alive()},
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
def create_report(
    req: ReportRequest,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
) -> dict:
    """
    Контракт неизменен: внутри — generate_business_report(niche, region, market_data).
    Эндпоинт остаётся публичным; если передан Bearer-токен, действие пишется в аудит.
    """
    report = llm.generate_business_report(req.niche, req.region, req.market_data.model_dump())
    ip, ua = _request_meta(request)
    log_action(
        "analysis_report",
        user_id=user.id if user else None,
        entity_type="niche",
        entity_id=req.niche,
        ip=ip,
        user_agent=ua,
        details={"region": req.region, "source": llm.last_report_source},
    )
    return {
        "niche": req.niche,
        "region": req.region,
        "source": llm.last_report_source,  # "gigachat" | "stub"
        "report": report,
    }


# ------------------------------------------------- Бизнес-план (PDF)
def _resolve_niche(raw: str) -> tuple[Optional[str], Optional[dict]]:
    """Ниша по id или по названию (как приходит из фронтенда)."""
    if raw in NICHES_BY_ID:
        return raw, NICHES_BY_ID[raw]
    wanted = raw.strip().lower()
    for nid, n in NICHES_BY_ID.items():
        if n["title"].lower() == wanted:
            return nid, n
    return None, None


def _cached_market_data(niche_id: str) -> Optional[dict]:
    """Метрики рынка из кэша market_snapshots — тяжёлый парсинг не перезапускаем.

    Толерантен к форме payload: берёт payload['market_data'], если есть,
    иначе сам payload, если он похож на словарь метрик.
    """
    try:
        with SessionLocal() as session:
            row = (
                session.query(MarketSnapshot)
                .filter(MarketSnapshot.niche_id == niche_id)
                .order_by(MarketSnapshot.id.desc())
                .first()
            )
            if row is None:
                return None
            payload = json.loads(row.payload)
            if not isinstance(payload, dict):
                return None
            md = payload.get("market_data")
            if isinstance(md, dict):
                return md
            if "competitors_count" in payload:
                return payload
            return None
    except Exception:  # noqa: BLE001 — кэш недоступен -> метрики каталога
        return None


@app.get("/api/v1/report/pdf/sections")
def pdf_sections() -> dict:
    """Реестр секций бизнес-плана (для настройки и будущего free/premium)."""
    return {"items": available_sections()}


@app.post("/api/v1/report/pdf")
def report_pdf(
    req: PdfReportRequest,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
) -> StreamingResponse:
    """
    Бизнес-план в PDF: титул, ключевые цифры, анализ рынка, ИИ-отчёт,
    риски/рост, рекомендации, дисклеймер. Состав секций — из PDF_SECTIONS
    (или параметра sections).

    Пайплайн переиспользует основной анализ: метрики — из кэша
    market_snapshots (без повторного парсинга города), скоринг — каталог,
    ИИ-отчёт — generate_business_report (GigaChat, fallback на заглушку).
    """
    niche_id, niche = _resolve_niche(req.niche)
    if niche is not None:
        title = niche["title"]
        score = float(niche["score"])
        survival = int(niche["survival"])
        base_md = dict(niche.get("market_data") or {})
    else:
        # Ниша вне каталога: метрики придут из кэша/запроса, скор нейтральный.
        title = req.niche
        score, survival, base_md = 50.0, 55, {}

    # 1) метрики рынка: кэш market_snapshots поверх каталожных значений
    market_data = {**base_md}
    cached = _cached_market_data(niche_id) if niche_id else None
    snapshot_created: Optional[str] = None
    if cached:
        for key in ("competitors_count", "density_per_100k", "competition_level", "avg_income", "budget"):
            if key in cached and cached[key] is not None:
                market_data[key] = cached[key]
        snapshot_created = "кэша market_snapshots"
    if req.budget > 0:
        market_data["budget"] = req.budget

    # 2) ИИ-отчёт — тот же, что в основном анализе
    report_text = llm.generate_business_report(title, req.region, market_data)

    # 3) город для титула: «Томская область, г. Томск» -> «Томск»
    city_name = req.region.split(",")[-1].strip()

    sections = resolve_sections(req.sections)
    ctx = build_pdf_context(
        niche_title=title,
        region=req.region,
        city_name=city_name,
        market_data=market_data,
        score=score,
        survival=survival,
        report_text=report_text,
        report_source=llm.last_report_source,
        snapshot_created=snapshot_created,
        sections=sections,
    )

    try:
        pdf_bytes = render_business_plan_pdf(ctx)
    except PdfEngineUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    filename = make_pdf_filename(title, req.region)
    ip, ua = _request_meta(request)
    log_action(
        "report_pdf",
        user_id=user.id if user else None,
        entity_type="niche",
        entity_id=niche_id or title,
        ip=ip,
        user_agent=ua,
        details={"region": req.region, "sections": sections, "filename": filename, "source": llm.last_report_source},
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------------------------------------------------- Аутентификация
def _user_public(user: User) -> dict:
    """Публичное представление пользователя — БЕЗ password_hash."""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "status": user.status,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


@app.post("/api/auth/register", status_code=201)
def register(req: RegisterRequest, request: Request) -> dict:
    """Регистрация: валидация e-mail/пароля, bcrypt-хэш, аудит. Пароль не хранится открыто."""
    ip, ua = _request_meta(request)
    with SessionLocal() as session:
        exists = session.query(User).filter(User.email == req.email).first()
        if exists:
            log_action("register_failed", ip=ip, user_agent=ua,
                       details={"reason": "email_taken", "email": req.email})
            raise HTTPException(status_code=409, detail="Пользователь с таким e-mail уже существует")
        user = User(
            email=req.email,
            password_hash=hash_password(req.password),  # только хэш, никогда не пароль
            name=req.name,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        user_id = user.id
    log_action("register", user_id=user_id, entity_type="user", entity_id=str(user_id),
               ip=ip, user_agent=ua, details={"email": req.email})
    return {"id": user_id, "email": req.email, "message": "Аккаунт создан. Войдите, чтобы получить токен."}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request) -> TokenResponse:
    """Вход: проверка пароля по хэшу, rate limit, JWT при успехе, аудит."""
    ip, ua = _request_meta(request)

    if not JWT_SECRET:
        raise HTTPException(status_code=503, detail="Аутентификация не настроена (нет JWT_SECRET)")

    # Защита от перебора: ограничение частоты попыток входа по ip+email.
    if too_many_attempts(ip, req.email):
        log_action("login_rate_limited", ip=ip, user_agent=ua, details={"email": req.email})
        raise HTTPException(status_code=429, detail="Слишком много попыток входа. Попробуйте позже.")

    with SessionLocal() as session:
        user = session.query(User).filter(User.email == req.email).first()
        if user is None or not verify_password(req.password, user.password_hash):
            register_failed_attempt(ip, req.email)
            log_action("login_failed", ip=ip, user_agent=ua,
                       details={"email": req.email, "reason": "bad_credentials"})
            raise HTTPException(status_code=401, detail="Неверный e-mail или пароль")
        if user.status != "active":
            log_action("login_failed", user_id=user.id, ip=ip, user_agent=ua,
                       details={"email": req.email, "reason": "blocked"})
            raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

        # Успех: сбрасываем счётчик попыток, обновляем last_login_at.
        clear_attempts(ip, req.email)
        user.last_login_at = datetime.now(timezone.utc)
        session.commit()
        payload_user = _user_public(user)
        user_id = user.id

    token = create_access_token(user_id, req.email, payload_user["role"])
    log_action("login", user_id=user_id, entity_type="user", entity_id=str(user_id),
               ip=ip, user_agent=ua)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=JWT_EXPIRE_MINUTES * 60,
        user=payload_user,
    )


@app.get("/api/auth/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
    """Текущий профиль (приватный: требует Bearer-токен)."""
    return UserPublic(**_user_public(user))


@app.post("/api/auth/change-password")
def change_password(req: ChangePasswordRequest, request: Request,
                    user: User = Depends(get_current_user)) -> dict:
    """Смена пароля (приватный): проверяем текущий, хэшируем новый."""
    ip, ua = _request_meta(request)
    with SessionLocal() as session:
        db_user = session.get(User, user.id)
        if db_user is None:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        if not verify_password(req.current_password, db_user.password_hash):
            log_action("password_change_failed", user_id=user.id, ip=ip, user_agent=ua,
                       details={"reason": "wrong_current_password"})
            raise HTTPException(status_code=400, detail="Текущий пароль указан неверно")
        db_user.password_hash = hash_password(req.new_password)
        session.commit()
    log_action("password_change", user_id=user.id, entity_type="user", entity_id=str(user.id),
               ip=ip, user_agent=ua)
    return {"message": "Пароль обновлён"}


@app.post("/api/auth/logout")
def logout(request: Request, user: User = Depends(get_current_user)) -> dict:
    """
    Выход: заносим jti токена в блок-лист до истечения срока действия.
    Токен в заголовке сам не передаётся в лог (аудит — без секретов).
    """
    ip, ua = _request_meta(request)
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        blacklist_token(auth_header.split(" ", 1)[1].strip())
    log_action("logout", user_id=user.id, entity_type="user", entity_id=str(user.id),
               ip=ip, user_agent=ua)
    return {"message": "Вы вышли из системы"}


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
def match_locations_route(
    req: MatchLocationsRequest,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
) -> MatchLocationsResponse:
    """
    Подбор конкретной локации: сетка ~500 м по городу, скор каждой ячейки
    (сигналы спроса / (1 + конкуренты)), топ-подборка с пояснениями.

    Источники ответа: overpass -> cache (TTL 7 дней) -> cache_stale (при сбое
    Overpass). Бизнес-логика скоринга ниш НЕ затронута; добавлен только аудит.
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

    ip, ua = _request_meta(request)
    log_action(
        "match_locations",
        user_id=user.id if user else None,
        entity_type="niche",
        entity_id=req.niche,
        ip=ip,
        user_agent=ua,
        details={"city": req.city, "source": result.get("source"), "cells": result["stats"]["cells_scored"]},
    )
    return MatchLocationsResponse(**result)


# ------------------------------------------------- История анализов (проекты)
def _project_dict(p: Project) -> dict:
    """Единообразная сериализация записи истории (для list/get)."""
    return {
        "id": p.id,
        "niche_id": p.niche_id,
        "niche_title": p.niche_title,
        "city": p.city,
        "city_name": p.city_name,
        "score": p.score,
        "survival": p.survival,
        "has_report": bool(p.has_report),
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "snapshot": json.loads(p.snapshot or "{}"),
    }


@app.get("/api/v1/projects")
def list_projects(user: User = Depends(get_current_user)) -> dict:
    """«Мои анализы»: ТОЛЬКО проекты текущего пользователя, в обратном
    хронологическом порядке. Чужие записи не отдаются никогда (фильтр по user_id)."""
    with SessionLocal() as session:
        rows = (
            session.query(Project)
            .filter(Project.user_id == user.id)
            .order_by(Project.id.desc())
            .limit(200)
            .all()
        )
        items = [_project_dict(r) for r in rows]
    return {"items": items, "total": len(items), "owner": {"id": user.id, "email": user.email}}


@app.get("/api/v1/projects/{project_id}")
def get_project(project_id: int, user: User = Depends(get_current_user)) -> dict:
    with SessionLocal() as session:
        p = session.query(Project).filter(Project.id == project_id).first()
        # Не раскрываем существование чужих записей: для не-владельца — 404.
        if p is None or p.user_id != user.id:
            raise HTTPException(status_code=404, detail=f"анализ №{project_id} не найден")
        return _project_dict(p)


@app.post("/api/v1/projects", status_code=201)
def create_project(req: ProjectCreateRequest, request: Request,
                   user: User = Depends(get_current_user)) -> dict:
    """Сохранить анализ в «Мои анализы». Требует входа: проект привязывается к
    текущему пользователю (user_id). Снимок метрик + отчёт — чтобы открытие не
    требовало повторного парсинга."""
    title = req.niche_title or (NICHES_BY_ID.get(req.niche_id) or {}).get("title", req.niche_id)
    snapshot = req.snapshot or {}
    has_report = 1 if snapshot.get("report") else 0
    with SessionLocal() as session:
        p = Project(
            user_id=user.id,
            niche_id=req.niche_id,
            niche_title=title,
            city=req.city,
            city_name=req.city_name,
            score=req.score,
            survival=req.survival,
            has_report=has_report,
            snapshot=json.dumps(snapshot, ensure_ascii=False),
        )
        session.add(p)
        session.commit()
        session.refresh(p)
        project_id = p.id
        created_at = p.created_at.isoformat() if p.created_at else None
    ip, ua = _request_meta(request)
    log_action(
        "save_project",
        user_id=user.id,
        entity_type="project",
        entity_id=str(project_id),
        ip=ip,
        user_agent=ua,
        details={"niche_id": req.niche_id, "city": req.city, "score": req.score},
    )
    return {"id": project_id, "created_at": created_at, "has_report": bool(has_report)}


@app.delete("/api/v1/projects/{project_id}")
def delete_project(project_id: int, request: Request,
                   user: User = Depends(get_current_user)) -> dict:
    with SessionLocal() as session:
        p = session.query(Project).filter(Project.id == project_id).first()
        if p is None or p.user_id != user.id:
            raise HTTPException(status_code=404, detail=f"анализ №{project_id} не найден")
        session.delete(p)
        session.commit()
    ip, ua = _request_meta(request)
    log_action(
        "delete_project",
        user_id=user.id,
        entity_type="project",
        entity_id=str(project_id),
        ip=ip,
        user_agent=ua,
    )
    return {"deleted": project_id}
