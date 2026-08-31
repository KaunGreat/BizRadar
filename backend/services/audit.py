"""
BizRadar · журнал действий пользователей (таблица action_logs).

КРИТИЧНО: в details никогда не должны попадать пароли и токены. Перед
сериализацией JSON прогоняется через _scrub, который рекурсивно удаляет
ключи-«подозреваемые» (password, token, secret, auth, hash, ...) и обрезает
значения-«подозреваемые». Аудит не должен ронять основной поток: ошибки
записи ловятся и лишь логируются.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from db import SessionLocal
from models import ActionLog

logger = logging.getLogger("bizradar.audit")

# Ключи, которые рекурсивно вычищаются из details перед записью.
_SENSITIVE_KEYS = {
    "password", "passwd", "pwd", "secret", "token", "access_token",
    "refresh_token", "authorization", "auth", "api_key", "apikey",
    "password_hash", "hash", "credential", "credentials", "jti",
}


def _scrub(value: Any) -> Any:
    """Рекурсивно удаляет чувствительные ключи из dict/list перед сериализацией."""
    if isinstance(value, dict):
        return {k: _scrub(v) for k, v in value.items() if str(k).lower() not in _SENSITIVE_KEYS}
    if isinstance(value, (list, tuple)):
        return [_scrub(v) for v in value]
    return value


def log_action(
    action: str,
    *,
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Записать действие в журнал. Безопасна для вызова в любом месте:
    сбой записи не ломает запрос.
    """
    safe_details = _scrub(details or {})
    try:
        with SessionLocal() as session:
            session.add(
                ActionLog(
                    user_id=user_id,
                    action=action,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    ip=ip,
                    user_agent=user_agent,
                    details=json.dumps(safe_details, ensure_ascii=False),
                )
            )
            session.commit()
    except Exception as exc:  # noqa: BLE001 — аудит не должен ронять основной поток
        logger.error("Не удалось записать действие %s в журнал: %s", action, exc)
