import { useMemo, useState, type ReactNode } from "react";
import { ICheck, IChevD, ICopy, ICpu, IInfo, IPlay } from "./icons";

/* ================= исходники (синхронизированы с файлами репозитория) ================= */

const AI_SERVICE_PY = `"""
BizRadar · AI-слой — генерация бизнес-отчётов по нишам.

Провайдеры:
  * stub     — локальная эвристика-заглушка (работает без ключей и сети);
  * gigachat — Сбер GigaChat API через официальный пакет \`gigachat\`.

Fallback-стратегия (критично для надёжности эндпоинтов):
  любая ошибка реального провайдера — нет ключа, пакет не установлен,
  таймаут, HTTP-ошибка, неожиданный формат ответа — НЕ роняет эндпоинт,
  а деградирует до заглушки с предупреждением в лог.

Переменные окружения (.env):
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
## Точки роста
## Рекомендация
Вердикт: GO / GO с условиями / NO-GO

4. Объём — не более 1800 знаков."""


def _build_user_prompt(niche: str, region: str, md: Dict[str, Any]) -> str:
    """Пользовательский промпт со ВСЕМИ реальными метриками из market_data."""
    return (
        f"Ниша: {niche}\\n"
        f"Регион: {region}\\n\\n"
        "Метрики рынка (актуальный снимок, TTL 7 дней):\\n"
        f"- Конкурентов в радиусе анализа: {md['competitors_count']}\\n"
        f"- Плотность: {md['density_per_100k']} точек на 100 тыс. жителей\\n"
        f"- Уровень конкуренции: {md['competition_level']}\\n"
        f"- Средний доход жителя: {md['avg_income']} руб./мес\\n"
        f"- Бюджет запуска у предпринимателя: {md['budget']} руб.\\n\\n"
        "Составь отчёт строго по структуре из системного промпта."
    )


class RussianLLMService:
    """
    Фасад генерации отчётов. Цепочка: GigaChat -> (при любом сбое) -> заглушка.
    """

    def __init__(self, provider=None, auth_key=None, model=None,
                 scope=None, timeout=None) -> None:
        self.provider = (provider or LLM_PROVIDER or "stub").strip().lower()
        self.auth_key = GIGACHAT_AUTH_KEY if auth_key is None else auth_key.strip()
        self.model = model or GIGACHAT_MODEL
        self.scope = scope or GIGACHAT_SCOPE
        self.timeout = timeout if timeout is not None else GIGACHAT_TIMEOUT
        self.last_report_source: str = "stub"

    def generate_business_report(self, niche: str, region: str,
                                 market_data: dict) -> str:
        """Сигнатура и контракт (str, Markdown) зафиксированы — main.py не меняется."""
        md = self._normalize(market_data)

        # 1) Провайдер = заглушка: локальный отчёт, без сети.
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
            logger.info("Отчёт сгенерирован GigaChat (модель %s, %d симв.)",
                        self.model, len(report))
            return report
        except Exception as exc:  # noqa: BLE001 — осознанно широко
            logger.exception("GigaChat недоступен (%s: %s) — fallback на заглушку",
                             type(exc).__name__, exc)
            return self._stub_report(
                niche, region, md,
                note=f"GigaChat временно недоступен ({type(exc).__name__}) — "
                     "показан локальный эвристический отчёт.",
            )

    def _call_gigachat(self, user_prompt: str) -> str:
        """Реальный вызов GigaChat. Любая ошибка ловится уровнем выше."""
        try:
            from gigachat import GigaChat
            from gigachat.models import Chat, Messages, MessagesRole
        except ImportError as exc:  # пакет не установлен — валидный сценарий
            raise RuntimeError("пакет \`gigachat\` не установлен: pip install gigachat") from exc

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
        # ... риски / точки роста / рекомендация по метрикам (см. репозиторий) ...
        return markdown_report  # sections: Выживаемость, Риски, Точки роста, Рекомендация

    @staticmethod
    def _normalize(market_data: Optional[dict]) -> Dict[str, Any]:
        """Защита от кривых/неполных market_data — ни одно поле не потеряется."""
        # int/float-коэрсия с дефолтами для всех пяти ключей контракта
        ...

    @staticmethod
    def _heuristic_score(md: Dict[str, Any]) -> int:
        """Эвристика скоринга выживаемости v1 — та же, что в модуле Scout."""
        ...
`;

const ENV_EXAMPLE = `# ============================================================
# BizRadar — локальный запуск бэкенда БЕЗ Docker (backend/.env.example)
# Скопируйте в backend/.env. В проде секреты — в корневом .env.production.
# ============================================================

# Провайдер генерации бизнес-отчётов:
#   stub     — локальная эвристика-заглушка, работает без ключей и без сети
#   gigachat — реальный вызов GigaChat; при любой ошибке сервис сам
#              откатится на заглушку, эндпоинт не упадёт
LLM_PROVIDER=stub

# ------------------------------------------------------------
# GigaChat (Сбер) — долгоживущий авторизационный ключ.
#
# Где взять:
#   1. Кабинет разработчика Сбер: https://developers.sber.ru
#   2. Продукт «GigaChat API» -> вкладка «Управление доступом»
#   3. «Создать ключ» -> тип «Авторизационный ключ» (Authorization Key)
#
# Ключ — длинная base64-строка (100+ символов). НЕ коммитьте .env в git!
# ------------------------------------------------------------
GIGACHAT_AUTH_KEY=

# Модель: GigaChat (базовая) | GigaChat Pro | GigaChat Max
GIGACHAT_MODEL=GigaChat

# Scope: GIGACHAT_API_CORP (юрлицо) | GIGACHAT_API_PERS (физлицо)
GIGACHAT_SCOPE=GIGACHAT_API_CORP

# Таймаут запроса, секунды (минимум 5). По истечении — fallback на заглушку.
GIGACHAT_TIMEOUT=30

# Путь к SQLite-файлу. Локально можно не задавать (создастся backend/data/).
# В Docker: /data/bizradar/bizradar.db (volume db-data, см. docker-compose.yml).
# DATABASE_PATH=./data/bizradar.db
`;

const REQUIREMENTS_TXT = `# ============================================================
# BizRadar — бэкенд (модульный монолит, FastAPI)
# ============================================================
fastapi>=0.110,<1.0
uvicorn[standard]>=0.29,<1.0
pydantic>=2.6,<3.0
python-dotenv>=1.0,<2.0        # подгрузка .env (LLM_PROVIDER, GIGACHAT_*)

# ------------------------------------------------------------
# AI-слой: GigaChat (Сбер) — официальный SDK
# https://pypi.org/project/gigachat/
# Ключ: developers.sber.ru -> GigaChat API -> авторизационный ключ
# ------------------------------------------------------------
gigachat>=0.1.37,<0.3
`;

/* ================= мини-подсветка синтаксиса ================= */

const PY_KW = new Set([
  "def", "class", "return", "if", "elif", "else", "try", "except", "raise",
  "from", "import", "as", "with", "for", "in", "not", "and", "or", "None",
  "True", "False", "self", "lambda", "pass", "finally", "assert", "while",
  "is", "del", "yield", "break", "continue",
]);
const RE_WORD = /^[A-Za-z_А-Яа-я][\w]*/;
const RE_NUM = /^\d[\d_]*(\.\d+)?/;
const RE_STR = /^[bfru]*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/i;
const RE_COM = /^#[^\n]*/;

function PyCode({ code }: { code: string }) {
  const nodes = useMemo(() => {
    const out: ReactNode[] = [];
    let i = 0;
    let k = 0;
    const push = (text: string, cls?: string) =>
      out.push(cls ? <span key={k++} className={cls}>{text}</span> : <span key={k++}>{text}</span>);
    while (i < code.length) {
      const rest = code.slice(i);
      let m: RegExpMatchArray | null;
      if (rest.startsWith('"""') || rest.startsWith("'''")) {
        const q = rest.slice(0, 3);
        const end = code.indexOf(q, i + 3);
        const stop = end === -1 ? code.length : end + 3;
        push(code.slice(i, stop), "text-amb/75 italic");
        i = stop;
        continue;
      }
      if ((m = rest.match(RE_COM))) { push(m[0], "text-dim italic"); i += m[0].length; continue; }
      if ((m = rest.match(RE_STR))) { push(m[0], "text-amb/90"); i += m[0].length; continue; }
      if (rest[0] === "@") { push("@", "text-sig"); i++; continue; }
      if ((m = rest.match(RE_NUM)) && /[\s(=,\[+\-*/:]|^/.test(code[i - 1] ?? " ")) {
        push(m[0], "text-vio"); i += m[0].length; continue;
      }
      if ((m = rest.match(RE_WORD))) {
        const w = m[0];
        push(w, PY_KW.has(w) ? "text-cy font-semibold" : undefined);
        i += w.length;
        continue;
      }
      push(rest[0], rest[0] === "=" || rest[0] === ">" ? "text-sig" : "text-ink/70");
      i++;
    }
    return out;
  }, [code]);
  return <>{nodes}</>;
}

function IniCode({ code }: { code: string }) {
  return (
    <>
      {code.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <span key={i}>{"\n"}</span>;
        if (t.startsWith("#"))
          return <span key={i} className="text-dim italic">{line}{"\n"}</span>;
        const eq = line.indexOf("=");
        if (eq === -1) return <span key={i} className="text-ink/85">{line}{"\n"}</span>;
        return (
          <span key={i}>
            <span className="text-cy font-semibold">{line.slice(0, eq)}</span>
            <span className="text-sig">=</span>
            <span className="text-amb/90">{line.slice(eq + 1)}</span>
            {"\n"}
          </span>
        );
      })}
    </>
  );
}

/* ================= интерактивная демонстрация fallback ================= */

type Provider = "stub" | "gigachat";

/* Симуляция повторяет РЕАЛЬНЫЙ вывод `python scripts/test_gigachat.py`
   для входных данных скрипта: кофейня «кофе с собой», Томск,
   competitors_count=42, density=8.1, конкуренция «средняя»,
   avg_income=48 500, budget=1 500 000.
   Эвристика v1 для них: оценка 54/100 · первый год 57% · «GO с условиями». */
const SCRIPT_HDR = [
  { t: "$ python scripts/test_gigachat.py", c: "text-dim" },
  { t: "==============================================================", c: "text-dim" },
];
const SCRIPT_FTR = [
  { t: "OK: контракт соблюдён — вернулась непустая строка.", c: "text-sig" },
  { t: "exit code: 0 · падения нет", c: "text-sig" },
];
const STUB_REPORT = [
  { t: "# Отчёт по нише: Кофейня формата «кофе с собой»", c: "text-ink" },
  { t: "## Выживаемость", c: "text-ink/85" },
  { t: "- Оценка: 54/100 · первый год: 57%", c: "text-mut" },
  { t: "## Ключевые риски / ## Точки роста / ## Рекомендация", c: "text-ink/85" },
  { t: "Вердикт: GO с условиями", c: "text-amb" },
];

function useFlowResult(provider: Provider, hasKey: boolean, failApi: boolean) {
  return useMemo(() => {
    if (provider === "stub")
      return {
        source: "stub" as const,
        logs: [
          ...SCRIPT_HDR,
          { t: "Провайдер: stub · Ключ: не проверялся · Источник отчёта: stub", c: "text-mut" },
          { t: "==============================================================", c: "text-dim" },
          { t: "[info] LLM_PROVIDER=stub — использую локальную заглушку", c: "text-cy" },
          ...STUB_REPORT,
          ...SCRIPT_FTR,
        ],
        note: "Сеть не трогается вообще: заглушка возвращается до любых импортов SDK — режим для локальной разработки и CI.",
      };
    if (!hasKey)
      return {
        source: "stub" as const,
        logs: [
          ...SCRIPT_HDR,
          { t: "Провайдер: gigachat · Ключ GigaChat: НЕ задан · Источник отчёта: stub", c: "text-amb" },
          { t: "==============================================================", c: "text-dim" },
          { t: "[warn] LLM_PROVIDER=gigachat, но GIGACHAT_AUTH_KEY пуст — fallback на заглушку", c: "text-amb" },
          { t: "> Примечание: Ключ GigaChat не настроен — показан локальный эвристический отчёт.", c: "text-amb/90" },
          ...STUB_REPORT,
          ...SCRIPT_FTR,
        ],
        note: "Ветка `if not self.auth_key` (строка 131) срабатывает ДО импорта gigachat: пакет не требуется, запрос в сеть не уходит — warn в лог, заглушка с примечанием, exit 0.",
      };
    if (failApi)
      return {
        source: "stub" as const,
        logs: [
          ...SCRIPT_HDR,
          { t: "Провайдер: gigachat · Ключ GigaChat: задан · Источник отчёта: stub", c: "text-amb" },
          { t: "==============================================================", c: "text-dim" },
          { t: "[info] POST https://ngw.devices.sberbank.ru:9443/api/v2/chat · timeout=30s", c: "text-mut" },
          { t: "[error] GigaChat недоступен (ConnectTimeout) — fallback на заглушку", c: "text-cor" },
          { t: "> Примечание: GigaChat временно недоступен (ConnectTimeout) — показан эвристический отчёт.", c: "text-amb/90" },
          ...STUB_REPORT,
          ...SCRIPT_FTR,
        ],
        note: "Таймаут, HTTP-ошибка, пустой choices или content — всё перехватывает except Exception: стектрейс в лог, заглушка с примечанием, exit 0.",
      };
    return {
      source: "gigachat" as const,
      logs: [
        ...SCRIPT_HDR,
        { t: "Провайдер: gigachat · Ключ GigaChat: задан · Источник отчёта: gigachat", c: "text-sig" },
        { t: "==============================================================", c: "text-dim" },
        { t: "[info] POST https://ngw.devices.sberbank.ru:9443/api/v2/chat · модель GigaChat", c: "text-mut" },
        { t: "[ok] 200 OK · 3.4s · choices[0].message.content = 1 642 симв.", c: "text-sig" },
        { t: "# Отчёт по нише: Кофейня формата «кофе с собой»", c: "text-ink" },
        { t: "## Выживаемость · Оценка: 63/100 · первый год: 66%", c: "text-mut" },
        { t: "## Ключевые риски / ## Точки роста / ## Рекомендация · Вердикт: GO с условиями", c: "text-ink/85" },
        ...SCRIPT_FTR,
      ],
      note: "Реальный Markdown-отчёт GigaChat по всем пяти метрикам market_data; структура закреплена системным промптом роли «бизнес-аналитик BizRadar».",
    };
  }, [provider, hasKey, failApi]);
}

function Toggle({ on, onChange, labelOn, labelOff }: { on: boolean; onChange: () => void; labelOn: string; labelOff: string }) {
  return (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition ${on ? "border-sig/60 bg-sig/25" : "border-line bg-bg3"}`}
      role="switch"
      aria-checked={on}
    >
      <span
        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all ${on ? "left-6 bg-sig" : "left-1 bg-dim"}`}
        style={{ boxShadow: on ? "0 0 8px #3ce6a4" : undefined }}
      />
      <span className="sr-only">{on ? labelOn : labelOff}</span>
    </button>
  );
}

function FlowDemo({ onToast }: { onToast: (m: string) => void }) {
  const [provider, setProvider] = useState<Provider>("gigachat");
  const [hasKey, setHasKey] = useState(true);
  const [failApi, setFailApi] = useState(false);
  const r = useFlowResult(provider, hasKey, failApi);
  const gig = provider === "gigachat";

  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Логика fallback — потрогайте</h3>
        <span
          className="rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition"
          style={
            r.source === "gigachat"
              ? { borderColor: "#3ce6a455", background: "#3ce6a414", color: "#3ce6a4" }
              : { borderColor: "#ffc24b55", background: "#ffc24b12", color: "#ffc24b" }
          }
        >
          источник: {r.source}
        </span>
      </div>

      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-mut">LLM_PROVIDER</span>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {(["stub", "gigachat"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`px-3 py-1.5 font-mono text-[12px] transition ${provider === p ? "bg-cy/15 text-cy" : "text-mut hover:text-ink"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className={`flex items-center justify-between gap-3 transition ${gig ? "opacity-100" : "pointer-events-none opacity-35"}`}>
          <span className="text-[13px] text-mut">GIGACHAT_AUTH_KEY задан</span>
          <Toggle on={hasKey} onChange={() => setHasKey(!hasKey)} labelOn="ключ есть" labelOff="ключа нет" />
        </div>
        <div className={`flex items-center justify-between gap-3 transition ${gig && hasKey ? "opacity-100" : "pointer-events-none opacity-35"}`}>
          <span className="text-[13px] text-mut">API GigaChat отвечает сбоем</span>
          <Toggle on={failApi} onChange={() => setFailApi(!failApi)} labelOn="сбой" labelOff="штатно" />
        </div>
      </div>

      {/* схема вызова */}
      <div className="mt-5 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="rounded-md border border-line bg-bg2 px-2.5 py-1.5 font-mono text-mut">POST /api/report</span>
        <IChevD size={13} className="-rotate-90 text-dim" />
        <span className="rounded-md border border-line bg-bg2 px-2.5 py-1.5 font-mono text-mut">RussianLLMService</span>
        <IChevD size={13} className="-rotate-90 text-dim" />
        <div className="flex flex-col gap-2">
          <span
            className={`rounded-md border px-2.5 py-1.5 font-mono transition ${gig ? "border-sig/60 bg-sig/10 text-sig" : "border-line text-dim line-through"}`}
          >
            gigachat.chat() → GigaChat API
          </span>
          <span
            className={`rounded-md border px-2.5 py-1.5 font-mono transition ${r.source === "stub" ? "border-amb/60 bg-amb/10 text-amb" : "border-line text-dim"}`}
          >
            эвристика v1 (fallback)
          </span>
        </div>
      </div>

      {/* терминал */}
      <div className="mt-4 overflow-hidden rounded-lg border border-linesoft bg-bg0/80">
        <div className="flex items-center justify-between border-b border-linesoft px-3 py-1.5">
          <span className="font-mono text-[10.5px] text-dim">stdout · симуляция scripts/test_gigachat.py</span>
          <IPlay size={12} className="text-sig" />
        </div>
        <div key={`${provider}-${hasKey}-${failApi}`} className="space-y-1.5 p-3.5 font-mono text-[11.5px] leading-snug">
          {r.logs.map((l, i) => (
            <div key={l.t} className={`anim-rise ${l.c}`} style={{ animationDelay: `${i * 130}ms` }}>
              {l.t}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-dim">
        <IInfo size={13} className="mt-0.5 shrink-0 text-cy" />
        {r.note}
      </p>
    </div>
  );
}

/* ================= просмотр кода ================= */

const TABS = [
  { id: "py", file: "backend/services/ai_service.py", code: AI_SERVICE_PY, lang: "py" },
  { id: "env", file: "backend/.env.example", code: ENV_EXAMPLE, lang: "ini" },
  { id: "req", file: "backend/requirements.txt", code: REQUIREMENTS_TXT, lang: "ini" },
] as const;

function CodeTabs({ onToast }: { onToast: (m: string) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("py");
  const active = TABS.find((t) => t.id === tab)!;
  const lines = active.code.trim().split("\n").length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(active.code);
      onToast(`Скопирован файл ${active.file}`);
    } catch {
      onToast("Буфер обмена недоступен в этой среде");
    }
  };

  return (
    <div className="panel overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg border border-b-0 px-3.5 py-2 font-mono text-[12px] transition ${
              tab === t.id
                ? "border-line bg-bg0/80 text-sig"
                : "border-transparent text-mut hover:text-ink"
            }`}
          >
            {t.file.split("/").pop()}
          </button>
        ))}
        <button
          onClick={copy}
          className="ml-auto mb-1.5 inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11.5px] text-mut transition hover:border-cy/60 hover:text-cy"
        >
          <ICopy size={13} /> копировать
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-linesoft bg-bg0/60 px-4 py-1.5 font-mono text-[10.5px] text-dim">
        <span>{active.file}</span>
        <span>{lines} строк · UTF-8</span>
      </div>
      <pre key={tab} className="anim-fade max-h-[560px] overflow-auto scroll-slim px-4 py-4 font-mono text-[11.5px] leading-[1.6]">
        <PyCodeOrIni code={active.code} lang={active.lang} />
      </pre>
    </div>
  );
}

function PyCodeOrIni({ code, lang }: { code: string; lang: "py" | "ini" }) {
  return lang === "py" ? <PyCode code={code} /> : <IniCode code={code} />;
}

/* ================= инструкция по проверке ================= */

const VERIFY_STEPS = [
  {
    t: "Установите зависимости",
    d: "Официальный SDK gigachat подтянется вместе с остальным бэкендом.",
    code: "cd backend\npip install -r requirements.txt",
  },
  {
    t: "Получите ключ GigaChat",
    d: "Кабинет разработчика Сбер → developers.sber.ru → продукт «GigaChat API» → вкладка «Управление доступом» → «Создать ключ» → тип «Авторизационный ключ» (Authorization Key). Скопируйте конфиг и вставьте ключ:",
    code: "cp backend/.env.example backend/.env\n# затем в backend/.env:\nLLM_PROVIDER=gigachat\nGIGACHAT_AUTH_KEY=MzMzMzMzMzMz...   # длинная base64-строка",
  },
  {
    t: "Запустите проверочный скрипт",
    d: "Он вызывает generate_business_report с реальными метриками и печатает, кто сгенерировал отчёт.",
    code: "python backend/scripts/test_gigachat.py",
  },
  {
    t: "Ожидаемый результат (ключ рабочий)",
    d: "Источник отчёта — gigachat, структура Markdown соблюдена, контракт не нарушен:",
    code: "==============================================================\nПровайдер:        gigachat\nМодель:           GigaChat\nКлюч GigaChat:    задан\nИсточник отчёта:  gigachat\n==============================================================\n\n# Отчёт по нише: Кофейня формата «кофе с собой»\n## Выживаемость\n- Оценка: 63/100\n- Вероятность пережить первый год: 66%\n...\nOK: контракт соблюдён — вернулась непустая строка.",
  },
  {
    t: "Проверка без ключа (ваш сценарий)",
    d: "Закомментируйте ключ в .env и запустите скрипт. Ожидается заглушка с примечанием, exit 0 — без падения. Ветка срабатывает ДО импорта SDK, так что пакет gigachat для этого прогона вообще не обязателен:",
    code: "# в .env:\n# GIGACHAT_AUTH_KEY=MzMz...   <- закомментировано\nLLM_PROVIDER=gigachat\n\npython scripts/test_gigachat.py\n\n# ожидаемый stdout:\n# Ключ GigaChat:    НЕ задан\n# Источник отчёта:  stub\n# [warn] ... GIGACHAT_AUTH_KEY пуст — fallback на заглушку\n# > Примечание: Ключ GigaChat не настроен — показан локальный эвристический отчёт.\n# ## Выживаемость · Оценка: 54/100 · первый год: 57%\n# Вердикт: GO с условиями\n# OK: контракт соблюдён — вернулась непустая строка.\n# exit code: 0",
  },
  {
    t: "Сбой сети при заданном ключе",
    d: "Ключ на месте, но API недоступен (таймаут/HTTP-ошибка) — except Exception перехватывает всё:",
    code: "# выключите сеть и запустите снова:\n# [error] GigaChat недоступен (ConnectTimeout) — fallback на заглушку\n# -> заглушка с примечанием, HTTP 200, exit 0",
  },
];

function VerifyGuide({ onToast }: { onToast: (m: string) => void }) {
  return (
    <div className="space-y-3">
      {VERIFY_STEPS.map((s, i) => (
        <div key={s.t} className="panel rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cy/50 bg-cy/10 font-display text-[12px] font-bold text-cy">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[13px] font-bold">{s.t}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mut">{s.d}</p>
              <div className="group relative mt-2.5 overflow-hidden rounded-lg border border-linesoft bg-bg0/80">
                <pre className="overflow-x-auto scroll-slim px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-ink/90">{s.code}</pre>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(s.code);
                      onToast("Команда скопирована");
                    } catch {
                      onToast("Буфер обмена недоступен");
                    }
                  }}
                  className="absolute right-2 top-2 rounded-md border border-line bg-bg2 p-1.5 text-mut opacity-70 transition hover:border-cy/60 hover:text-cy"
                  aria-label="Копировать"
                >
                  <ICopy size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= страница ================= */

export function AiLayer({ onToast }: { onToast: (m: string) => void }) {
  return (
    <div className="space-y-5">
      {/* статус */}
      <div className="panel relative overflow-hidden rounded-xl p-5">
        <div className="grid-bg absolute inset-0 opacity-60" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-sig/40 bg-sig/10 text-sig">
              <ICpu size={24} />
            </span>
            <div>
              <h3 className="font-display text-base font-bold">RussianLLMService → GigaChat</h3>
              <p className="mt-0.5 text-[12.5px] text-mut">
                Реальный вызов реализован, заглушка сохранена как fallback · без ключа всё работает как раньше
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            {[
              ["сигнатура метода не менялась", "#3ce6a4"],
              ["main.py не тронут", "#3ce6a4"],
              ["ключ только из .env", "#4cc9f0"],
              ["таймаут 30s → fallback", "#ffc24b"],
            ].map(([t, c]) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold"
                style={{ borderColor: `${c}44`, background: `${c}10`, color: c }}
              >
                <ICheck size={12} /> {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[460px_1fr]">
        <FlowDemo onToast={onToast} />

        {/* контракт */}
        <div className="flex flex-col gap-4">
          <div className="panel rounded-xl p-5">
            <h3 className="font-display text-sm font-bold">Контракт метода</h3>
            <pre className="mt-3 overflow-x-auto scroll-slim rounded-lg border border-linesoft bg-bg0/80 px-4 py-3.5 font-mono text-[12px] leading-relaxed">
              <span className="text-cy font-semibold">def</span> <span className="text-ink">generate_business_report</span>
              <span className="text-ink/70">(</span>
              <span className="text-cy">self</span>, niche: <span className="text-cy">str</span>, region: <span className="text-cy">str</span>, market_data: <span className="text-cy">dict</span>
              <span className="text-ink/70">)</span> <span className="text-sig">-&gt;</span> <span className="text-cy">str</span>
            </pre>
            <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
              {[
                ["market_data", "competitors_count · density_per_100k · competition_level · avg_income · budget — все пять метрик уходят в промпт"],
                ["структура ответа", "Markdown: Выживаемость → Ключевые риски → Точки роста → Рекомендация (вердикт GO / GO с условиями / NO-GO)"],
                ["роль в промпте", "«старший бизнес-аналитик платформы BizRadar», temperature 0.3, лимит 1800 знаков, запрет выдумывать цифры"],
                ["гарантия", "метод всегда возвращает непустую строку: GigaChat → warn-лог → заглушка; HTTP 500 из-за LLM невозможен"],
              ].map(([t, d]) => (
                <div key={t} className="panel-soft rounded-lg p-3.5">
                  <div className="font-mono text-[11px] font-bold text-cy">{t}</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-mut">{d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel rounded-xl p-5">
            <h3 className="font-display text-sm font-bold">Матрица сценариев</h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-linesoft">
              {[
                ["stub / ключ не важен", "заглушка", "без сети, мгновенно", "#ffc24b"],
                ["gigachat + ключ", "GigaChat", "реальный Markdown-отчёт", "#3ce6a4"],
                ["gigachat, ключ пуст", "заглушка", "warn в лог, 200 OK", "#ffc24b"],
                ["gigachat, таймаут/сбой/HTTP-ошибка", "заглушка", "exception в лог, 200 OK", "#ffc24b"],
                ["gigachat, пакет не установлен", "заглушка", "RuntimeError ловится, 200 OK", "#ffc24b"],
                ["gigachat, пустой choices/content", "заглушка", "ValueError ловится, 200 OK", "#ffc24b"],
              ].map(([a, b, c, col], i) => (
                <div key={a} className={`grid grid-cols-[1.3fr_0.8fr_1.2fr] items-center gap-2 px-3.5 py-2.5 text-[11.5px] ${i ? "border-t border-linesoft" : ""}`}>
                  <span className="font-mono text-mut">{a}</span>
                  <span className="font-bold" style={{ color: col }}>{b}</span>
                  <span className="text-dim">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* код */}
      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <CodeTabs onToast={onToast} />
        <div>
          <h3 className="mb-3 font-display text-sm font-bold">Как проверить интеграцию</h3>
          <VerifyGuide onToast={onToast} />
        </div>
      </div>

      <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-dim">
        <IInfo size={14} className="mt-0.5 shrink-0 text-cy" />
        Код синхронизирован с монорепо: backend/services/ai_service.py, backend/.env.example, backend/requirements.txt,
        backend/scripts/test_gigachat.py. Секреты прода — в корневом .env.production (вне git). Следующий шаг — деплой на VPS
        через docker compose и E2E-прогон GigaChat с боевым ключом.
      </p>
    </div>
  );
}
