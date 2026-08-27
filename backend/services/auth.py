"""
BizRadar · аутентификация: регистрация, вход, JWT, защита эндпоинтов.

Секреты и настройки — только из окружения (никогда не хардкодятся):
  JWT_SECRET           HS256-подпись токенов (генерируйте: python -c "...secrets.token_urlsafe(48)")
  JWT_EXPIRE_MINUTES   срок жизни access-токена (по умолчанию 60)
  JWT_ALGORITHM        по умолчанию HS256

Пароли хэшируются bcrypt и НИКОГДА не хранятся и не логируются открыто.

Про передачу токена: сейчас — заголовок `Authorization: Bearer <token>`.
Позже для большей безопасности стоит перейти на httpOnly-cookie: браузер
не даст JS прочитать токен (защита от XSS-краж), а CSRF закрывается
флагом SameSite=Strict и/или CSRF-токеном. В cookie-варианте также
включают флаг Secure (только HTTPS) и валидацию происхождения запроса.
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import SessionLocal
from models import User

logger = logging.getLogger("bizradar.auth")

# ------------------------------------------------------------------ конфиг
JWT_SECRET: str = (os.getenv("JWT_SECRET") or "").strip()
JWT_ALGORITHM: str = (os.getenv("JWT_ALGORITHM") or "HS256").strip()
try:
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES") or "60")
except ValueError:
    JWT_EXPIRE_MINUTES = 60

MIN_PASSWORD_LEN = 8
LOGIN_LIMIT_MAX = 5          # попыток входа...
LOGIN_LIMIT_WINDOW = 60.0    # ...в течение окна, секунд

if not JWT_SECRET:
    # Не падаем на старте (локальный dev), но предупреждаем громко: без секрета
    # подписывать токены нельзя, и auth-эндпоинты вернут 503 до его задания.
    logger.warning("JWT_SECRET не задан — аутентификация будет недоступна, пока переменная не установлена")

_bearer = HTTPBearer(auto_error=False)


# ------------------------------------------------------------------ пароли
def hash_password(plain: str) -> str:
    """bcrypt-хэш пароля (соль встроена в сам хэш)."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Сравнение пароля с хэшем. Никогда не логируйте `plain`."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ------------------------------------------------------------------ JWT
def create_access_token(user_id: int, email: str, role: str) -> str:
    """Access-токен HS256. jti нужен для блок-листа (выход)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "jti": secrets.token_urlsafe(16),
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Декодирование и валидация подписи/срока. Бросает jwt.PyJWTError."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# ------------------------------------------------------ блок-лист (выход)
# JWT stateless, поэтому «выход» = занести jti в блок-лист до истечения exp.
# In-memory хранилище подходит для одного инстанса; при горизонтальном
# масштабировании замените на Redis с TTL = оставшееся время жизни токена.
_BLOCKLIST: dict[str, float] = {}  # jti -> unix-время истечения токена


def blacklist_token(token: str) -> None:
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        return  # токен и так невалиден — блокировать нечего
    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp:
        _BLOCKLIST[jti] = float(exp)
        _purge_blocklist()


def is_blacklisted(payload: dict) -> bool:
    return payload.get("jti") in _BLOCKLIST


def _purge_blocklist() -> None:
    """Вычищаем истёкшие jti, чтобы блок-лист не рос бесконечно."""
    now = time.time()
    stale = [k for k, exp in _BLOCKLIST.items() if exp < now]
    for k in stale:
        _BLOCKLIST.pop(k, None)


# ------------------------------------------------------------- rate limit
# Простое ограничение частоты попыток входа по ключу (ip + email).
# Счётчики in-memory; при нескольких инстансах — тоже выносить в Redis.
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}


def _rate_key(ip: str, email: str) -> str:
    return f"{ip}|{email.lower()}"


def register_failed_attempt(ip: str, email: str) -> None:
    key = _rate_key(ip, email)
    now = time.time()
    bucket = [t for t in _LOGIN_ATTEMPTS.get(key, []) if now - t < LOGIN_LIMIT_WINDOW]
    bucket.append(now)
    _LOGIN_ATTEMPTS[key] = bucket


def clear_attempts(ip: str, email: str) -> None:
    _LOGIN_ATTEMPTS.pop(_rate_key(ip, email), None)


def too_many_attempts(ip: str, email: str) -> bool:
    now = time.time()
    recent = [t for t in _LOGIN_ATTEMPTS.get(_rate_key(ip, email), []) if now - t < LOGIN_LIMIT_WINDOW]
    return len(recent) >= LOGIN_LIMIT_MAX


# ---------------------------------------------------------- зависимости
def _request_meta(request: Request) -> tuple[str, str]:
    """IP (с учётом прокси) и User-Agent для аудита."""
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "")
    return ip, request.headers.get("user-agent", "")[:512]


def _load_user(user_id: int) -> Optional[User]:
    with SessionLocal() as session:
        return session.get(User, user_id)


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> User:
    """Защищает приватные эндпоинты: валидирует токен и достаёт пользователя."""
    if not JWT_SECRET:
        raise HTTPException(status_code=503, detail="Аутентификация не настроена (нет JWT_SECRET)")
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Токен истёк — войдите заново") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Недействительный токен") from exc

    if is_blacklisted(payload):
        raise HTTPException(status_code=401, detail="Токен отозван (выход выполнен)")

    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Недействительный токен") from exc

    user = _load_user(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    if user.status != "active":
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    return user


def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[User]:
    """
    Мягкая версия для публичных эндпоинтов: возвращает пользователя, если токен
    валиден, иначе None. Позволяет вести аудит действий и анонимно, и по имени,
    НЕ закрывая сами эндпоинты (бизнес-логика анализа остаётся публичной).
    """
    if not JWT_SECRET or credentials is None or not credentials.credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
    except jwt.PyJWTError:
        return None
    if is_blacklisted(payload):
        return None
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        return None
    user = _load_user(user_id)
    return user if (user is not None and user.status == "active") else None
