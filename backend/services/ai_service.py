"""
BizRadar · AI-слой — генерация бизнес-отчётов по нишам.

Провайдеры:
  * stub     — локальная эвристика-заглушка (работает без ключей и сети);
  * gigachat — Сбер GigaChat API через официальный пакет `gigachat`.

Fallback-стратегия (критично для надёжности эндпоинтов):
  любая ошибка реального провайдера — нет ключа, пакет не установлен,
  таймаут, HTTP-ошибка, неожиданный формат ответа — НЕ роняет эндпоинт,
  а деградирует до заглушки с предупреждением в лог.

Переменные окружения (.env / .env.production):
  LLM_PROVIDER      stub | gigachat                        (по умолчанию stub)
  GIGACHAT_AUTH_KEY долгоживущий авторизационный ключ (developers.sber.ru)
  GIGACHAT_MODEL    GigaChat | GigaChat Pro | GigaChat Max (по умолчанию GigaChat)
  GIGACHAT_SCOPE    GIGACHAT_API_CORP | GIGACHAT_API_PERS  (по умолчанию CORP)
  GIGACHAT_TIMEOUT  таймаут запроса в секундах             (по умолчанию 30)

Сигнатура публичного метода ЗАФИКСИРОВАНА (не менять — на неё завязан main.py):
  generate_business_report(self, niche: str, region: str, market_data: dict) -> str
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger("bizradar.ai")

# ---------------------------------------------------------------------------
# Конфигурация из окружения (python-dotenv подгружает .env в main.py)
# ---------------------------------------------------------------------------
LLM_PROVIDER: str = (os.getenv("LLM_PROVIDER") or "stub").strip().lower()
GIGACHAT_AUTH_KEY: str = (os.getenv("GIGACHAT_AUTH_KEY") or "").strip()
GIGACHAT_MODEL: str = (os.getenv("GIGACHAT_MODEL") or "GigaChat").strip() or "GigaChat"
GIGACHAT_SCOPE: str = (os.getenv("GIGACHAT_SCOPE") or "GIGACHAT_API_CORP").strip()
try:
    GIGACHAT_TIMEOUT: float = max(5.0, float(os.getenv("GIGACHAT_TIMEOUT") or "30"))
except ValueError:
    GIGACHAT_TIMEOUT = 30.0

# ---------------------------------------------------------------------------
# Промпты
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """Ты — старший бизнес-аналитик платформы BizRadar. Ты оцениваешь
привлекательность бизнес-ниш для начинающих предпринимателей на основе реальных
данных рынка: конкуренты из OSM (Overpass API), плотность точек, демография
и доходы региона.

Требования к ответу:
1. Пиши по-русски, конкретно, без воды и общих фраз.
2. Опирайся ТОЛЬКО на переданные метрики. Не выдумывай цифры, которых нет в данных.
3. Формат — Markdown со строгой структурой:

## Выживаемость
- Оценка: X/100
- Вероятность пережить первый год: Y%
- Обоснование (2-3 предложения)

## Ключевые риски
1. ...
2. ...
3. ...

## Точки роста
1. ...
2. ...
3. ...

## Рекомендация
Вердикт: GO / GO с условиями / NO-GO
Первые шаги: 3 конкретных пункта.

4. Объём — не более 1800 знаков."""


def _build_user_prompt(niche: str, region: str, md: Dict[str, Any]) -> str:
    """Пользовательский промпт со ВСЕМИ реальными метриками из market_data."""
    return (
        f"Ниша: {niche}\n"
        f"Регион: {region}\n\n"
        "Метрики рынка (актуальный снимок, TTL 7 дней):\n"
        f"- Конкурентов в радиусе анализа: {md['competitors_count']}\n"
        f"- Плотность: {md['density_per_100k']} точек на 100 тыс. жителей\n"
        f"- Уровень конкуренции: {md['competition_level']}\n"
        f"- Средний доход жителя: {md['avg_income']} руб./мес\n"
        f"- Бюджет запуска у предпринимателя: {md['budget']} руб.\n\n"
        "Составь отчёт строго по структуре из системного промпта."
    )


class RussianLLMService:
    """
    Фасад генерации отчётов. Цепочка: GigaChat -> (при любом сбое) -> заглушка.

    Атрибут `last_report_source` после вызова показывает, кто фактически
    сгенерировал отчёт: "gigachat" | "stub" (удобно для логирования и тестов).
    """

    def __init__(
        self,
        provider: Optional[str] = None,
        auth_key: Optional[str] = None,
        model: Optional[str] = None,
        scope: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        self.provider = (provider or LLM_PROVIDER or "stub").strip().lower()
        self.auth_key = GIGACHAT_AUTH_KEY if auth_key is None else auth_key.strip()
        self.model = model or GIGACHAT_MODEL
        self.scope = scope or GIGACHAT_SCOPE
        self.timeout = timeout if timeout is not None else GIGACHAT_TIMEOUT
        self.last_report_source: str = "stub"

    # ------------------------------------------------------------------ API
    def generate_business_report(self, niche: str, region: str, market_data: dict) -> str:
        """
        Публичный метод. Сигнатура и контракт возврата (обычная строка,
        Markdown) зафиксированы — main.py не меняется.
        """
        md = self._normalize(market_data)

        # 1) Провайдер = заглушка: сразу локальный отчёт, без сети.
        if self.provider != "gigachat":
            logger.info("LLM_PROVIDER=%s — использую локальную заглушку", self.provider)
            return self._stub_report(niche, region, md)

        # 2) Провайдер = gigachat, но ключ не настроен — не падаем.
        if not self.auth_key:
            logger.warning(
                "LLM_PROVIDER=gigachat, но GIGACHAT_AUTH_KEY пуст — fallback на заглушку"
            )
            return self._stub_report(
                niche, region, md,
                note="Ключ GigaChat не настроен — показан локальный эвристический отчёт.",
            )

        # 3) Реальный вызов GigaChat с тотальной страховкой.
        try:
            report = self._call_gigachat(_build_user_prompt(niche, region, md))
            self.last_report_source = "gigachat"
            logger.info("Отчёт сгенерирован GigaChat (модель %s, %d симв.)", self.model, len(report))
            return report
        except Exception as exc:  # noqa: BLE001 — осознанно широко: эндпоинт не должен падать
            logger.exception("GigaChat недоступен (%s: %s) — fallback на заглушку", type(exc).__name__, exc)
            return self._stub_report(
                niche, region, md,
                note=f"GigaChat временно недоступен ({type(exc).__name__}) — показан локальный эвристический отчёт.",
            )

    # ------------------------------------------------------------ GigaChat
    def _call_gigachat(self, user_prompt: str) -> str:
        """
        Реальный вызов GigaChat. Любая ошибка пробрасывается наверх —
        её перехватывает generate_business_report и включает fallback.
        """
        try:
            from gigachat import GigaChat
            from gigachat.models import Chat, Messages, MessagesRole
        except ImportError as exc:  # пакет не установлен — тоже валидный сценарий
            raise RuntimeError("пакет `gigachat` не установлен: pip install gigachat") from exc

        with GigaChat(
            credentials=self.auth_key,      # Authorization Key из developers.sber.ru
            model=self.model,
            scope=self.scope,               # CORP для юрлиц, PERS для физлиц
            timeout=self.timeout,           # жёсткий таймаут, дальше — fallback
            # Цепочка сертификатов GigaChat выпущена российским УЦ:
            # вне контура Госуслуг стандартная проверка не проходит.
            verify_ssl_certs=False,
        ) as giga:
            payload = Chat(
                model=self.model,
                temperature=0.3,  # аналитический стиль, меньше "креатива"
                messages=[
                    Messages(role=MessagesRole.SYSTEM, content=SYSTEM_PROMPT),
                    Messages(role=MessagesRole.USER, content=user_prompt),
                ],
            )
            response = giga.chat(payload)

        # Валидация формата ответа — защищаемся от неожиданной структуры.
        choices = getattr(response, "choices", None) or []
        if not choices:
            raise ValueError("пустой ответ GigaChat: choices == []")
        content = getattr(choices[0].message, "content", "")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("пустой ответ GigaChat: message.content пуст")
        return content.strip()

    # --------------------------------------------------------------- заглушка
    def _stub_report(self, niche, region, md, note=None) -> str:
        """Локальная эвристика v1 — тот же структурный контракт, что у GigaChat."""
        self.last_report_source = "stub"
        score = self._heuristic_score(md)
        survival = round(25 + score * 0.6)
        verdict = "GO" if score >= 70 else ("GO с условиями" if score >= 50 else "NO-GO")

        risks = []
        if md["density_per_100k"] > 6:
            risks.append(
                f"Высокая плотность конкурентов ({md['density_per_100k']} точек на 100 тыс. жителей): "
                "трафик придётся отвоевывать, а не делить растущий спрос."
            )
        if md["competition_level"] == "высокая":
            risks.append("Ценовые войны с действующими игроками — маржа под давлением с первого месяца.")
        if md["avg_income"] and md["avg_income"] < 40_000:
            risks.append(f"Сдержанный платёжеспособный спрос: средний доход {md['avg_income']} руб./мес.")
        if md["budget"] and md["budget"] < 1_000_000:
            risks.append("Бюджет впритык: нет подушки на 2-3 месяца операционного убытка.")
        risks.append("Сезонность спроса: запускаться лучше за 1-2 месяца до высокого сезона.")
        risks = risks[:4]

        growth = [
            "Локация у стабильного пешеходного трафика — проверьте точкой на карте конкурентов BizRadar.",
            "Дифференциация через сервис и часы работы, а не через цену.",
            "Кросс-продажи и программа лояльности для возврата клиента во вторую неделю.",
        ]
        if md["budget"] and md["budget"] >= 1_500_000:
            growth.append("Запас бюджета позволяет выбрать площадку с арендой на 15-20% выше средней ради проходимости.")

        header = [
            f"# Отчёт по нише: {niche}",
            f"**Регион:** {region} · **Источник:** локальная эвристика v1 (заглушка, GigaChat не вызывался)",
        ]
        if note:
            header.append(f"> Примечание: {note}")

        lines = header + [
            "",
            "## Выживаемость",
            f"- Оценка: {score}/100",
            f"- Вероятность пережить первый год: {survival}%",
            f"- Обоснование: конкуренция «{md['competition_level']}», {md['competitors_count']} конкурентов "
            f"при плотности {md['density_per_100k']} на 100 тыс. жителей; спрос ограничен доходом "
            f"{md['avg_income']} руб./мес при бюджете запуска {md['budget']} руб.",
            "",
            "## Ключевые риски",
        ]
        lines += [f"{i}. {r}" for i, r in enumerate(risks, 1)]
        lines += ["", "## Точки роста"]
        lines += [f"{i}. {g}" for i, g in enumerate(growth, 1)]
        lines += [
            "",
            "## Рекомендация",
            f"Вердикт: **{verdict}**",
            "Первые шаги:",
            "1. Забронировать 2-3 площадки и замерить трафик в будни и выходные.",
            "2. Пересчитать юнит-экономику в модуле Finance с реальной арендой.",
            "3. Проверить точки конкурентов в радиусе 500 м на карте BizRadar.",
        ]
        return "\n".join(lines)

    # ------------------------------------------------------------- вспомогат.
    @staticmethod
    def _normalize(market_data: Optional[dict]) -> Dict[str, Any]:
        """Защита от кривых/неполных market_data — ни одно поле не потеряется."""
        md = market_data if isinstance(market_data, dict) else {}

        def num(key: str, default: float) -> float:
            try:
                value = md.get(key, default)
                return float(value) if value is not None else default
            except (TypeError, ValueError):
                return default

        return {
            "competitors_count": int(num("competitors_count", 0)),
            "density_per_100k": round(num("density_per_100k", 0.0), 1),
            "competition_level": str(md.get("competition_level") or "средняя").strip().lower(),
            "avg_income": int(num("avg_income", 0)),
            "budget": int(num("budget", 0)),
        }

    @staticmethod
    def _heuristic_score(md: Dict[str, Any]) -> int:
        """Эвристика скоринга выживаемости v1 — та же, что в модуле Scout."""
        score = 50.0
        density = md["density_per_100k"] or 5.0
        score += max(-18.0, 12.0 - density * 2.0)  # меньше конкурентов — выше балл
        score += {"низкая": 12.0, "средняя": 0.0, "высокая": -14.0}.get(md["competition_level"], 0.0)
        if md["avg_income"] >= 55_000:
            score += 10.0
        elif 0 < md["avg_income"] < 35_000:
            score -= 8.0
        if md["budget"] >= 1_500_000:
            score += 8.0
        elif 0 < md["budget"] < 700_000:
            score -= 6.0
        return max(5, min(95, round(score)))
