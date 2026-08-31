"""
BizRadar · генерация PDF бизнес-плана по результатам анализа ниши.

СТЕК: Jinja2 (HTML+CSS шаблон templates/business_plan.html.j2) + WeasyPrint.

Почему WeasyPrint, а не fpdf2/reportlab:
  * полноценная типографика и газетная вёрстка (A4, колонтитулы через @page,
    счётчики страниц, разрывы секций) — fpdf2 даёт лишь базовые блоки,
    reportlab требует рисовать каждый элемент вручную;
  * «тяжесть» ограничена: системные pango/cairo + fonts-dejavu ставятся одной
    строкой в Dockerfile и дают корректную кириллицу И локально, И в контейнере.

Кириллица: в CSS-стеке первым стоит «DejaVu Sans» (полное кириллическое
покрытие). В Docker шрифт приходит из пакета fonts-dejavu-core, у разработчика
локально — из системных шрифтов (DejaVu есть почти везде; при его отсутствии
fontconfig подставит любой кириллический sans).

НАСТРАИВАЕМЫЙ СОСТАВ СЕКЦИЙ: PDF_SECTIONS (env, через запятую) или параметр
sections в запросе. Флаг premium в реестре — фундамент будущего разделения
на бесплатную и премиум-версии (бизнес-логика при этом не меняется).
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup  # в Jinja2 3.1+ Markup живёт в markupsafe

logger = logging.getLogger("bizradar.pdf")

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEMPLATE_DIR = os.path.join(_BACKEND_DIR, "templates")

DISCLAIMER = (
    "Отчёт сформирован автоматически на основе открытых данных "
    "(OpenStreetMap, Росстат/ЕМИСС) и не является финансовой рекомендацией. "
    "Перед инвестиционным решением проверьте цифры независимым исследованием."
)

# -------------------------------------------------------------------- секции
SECTION_REGISTRY: Dict[str, Dict[str, Any]] = {
    "cover":           {"title": "Титульный лист",      "premium": False},
    "summary":         {"title": "Ключевые показатели", "premium": False},
    "market":          {"title": "Анализ рынка",        "premium": False},
    "ai_report":       {"title": "Отчёт ИИ-аналитика",  "premium": True},
    "risks_growth":    {"title": "Риски и точки роста", "premium": False},
    "recommendations": {"title": "Рекомендации и шаги", "premium": True},
    "disclaimer":      {"title": "Дисклеймер",          "premium": False},
}
_DEFAULT_SECTIONS = "cover,summary,market,ai_report,risks_growth,recommendations,disclaimer"


def resolve_sections(requested: Optional[List[str]]) -> List[str]:
    """Валидный список секций из запроса либо из PDF_SECTIONS / дефолта."""
    raw = requested if requested is not None else os.getenv("PDF_SECTIONS", _DEFAULT_SECTIONS)
    if isinstance(raw, str):
        raw = [s.strip() for s in raw.split(",") if s.strip()]
    valid = [s for s in raw if s in SECTION_REGISTRY]
    if not valid:  # пустая/мусорная конфигурация — показываем полный документ
        return list(SECTION_REGISTRY.keys())
    return valid


def available_sections() -> List[Dict[str, Any]]:
    return [{"id": k, "title": v["title"], "premium": v["premium"]} for k, v in SECTION_REGISTRY.items()]


# ------------------------------------------------------------- транслитерация
_RU2EN = str.maketrans(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    "abvgdeezzijklmnoprstufhccsssyieua",
)


def _slug(text: str, max_len: int = 24) -> str:
    s = text.lower().replace("ё", "е").translate(_RU2EN)
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s[:max_len].rstrip("_") or "project"


def make_pdf_filename(niche_title: str, region: str) -> str:
    """bizradar_kofeynya_tomsk_2026-08-28.pdf — латиница, без пробелов."""
    # город — последняя часть региона («Томская область, г. Томск» -> «Томск»)
    city = region.split(",")[-1].strip()
    city = re.sub(r"^(г\.?|город)\s*", "", city, flags=re.IGNORECASE).strip() or region
    niche = "_".join(_slug(w, 12) for w in re.split(r"[«»\s]+", niche_title) if w)[:2] or _slug(niche_title)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"bizradar_{niche}_{_slug(city, 12)}_{date}.pdf"


# ------------------------------------------------------------------ markdown
def markdown_to_html(md: str) -> str:
    """Мини-конвертер Markdown ИИ-отчёта в HTML (заголовки, списки, цитаты, bold)."""
    html: List[str] = []
    ul: List[str] = []
    ol: List[str] = []

    def flush() -> None:
        if ul:
            html.append("<ul>" + "".join(f"<li>{x}</li>" for x in ul) + "</ul>")
            ul.clear()
        if ol:
            html.append("<ol>" + "".join(f"<li>{x}</li>" for x in ol) + "</ol>")
            ol.clear()

    def inline(t: str) -> str:
        t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
        return t

    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            flush()
            continue
        if line.startswith("# "):
            flush()
            html.append(f'<h3 class="ai-title">{inline(line[2:])}</h3>')
        elif line.startswith("## "):
            flush()
            html.append(f'<h4 class="ai-h">{inline(line[3:])}</h4>')
        elif line.startswith("> "):
            flush()
            html.append(f'<blockquote>{inline(line[2:])}</blockquote>')
        elif line.startswith("- "):
            ul.append(inline(line[2:]))
        elif re.match(r"^\d+\.\s", line):
            ol.append(inline(re.sub(r"^\d+\.\s", "", line)))
        else:
            flush()
            html.append(f"<p>{inline(line)}</p>")
    flush()
    return "".join(html)


# ------------------------------------------------------------------ контенты
def _money(v: float) -> str:
    return f"{int(round(v)):,}".replace(",", " ") + " ₽"


def interpret_market(md: Dict[str, Any], niche_title: str) -> List[str]:
    """Краткая интерпретация метрик простым языком (для раздела «Анализ рынка»)."""
    density = float(md.get("density_per_100k") or 0)
    comp = str(md.get("competition_level") or "средняя").lower()
    income = float(md.get("avg_income") or 0)
    budget = float(md.get("budget") or 0)
    competitors = int(md.get("competitors_count") or 0)

    if density < 2:
        dens_txt = f"плотность точек низкая ({density} на 100 тыс. жителей) — рынок далёк от насыщения"
    elif density <= 6:
        dens_txt = f"плотность умеренная ({density} на 100 тыс. жителей) — спрос есть, но свободные ниши ещё остаются"
    else:
        dens_txt = f"плотность высокая ({density} на 100 тыс. жителей) — рынок поделён, вход потребует сильного отличия"

    paras = [
        f"По данным снимка рынка, в радиусе анализа зафиксировано {competitors} прямых конкурентов; {dens_txt}.",
        {
            "низкая": "Конкуренция оценивается как низкая: действующих игроков немного, и лояльность аудитории ещё не закреплена — это окно для входа.",
            "средняя": "Конкуренция средняя: игроки есть, но без монополии сетей. Решать будет локация, сервис и узнаваемость точки.",
            "высокая": "Конкуренция высокая: сильные игроки уже заняли трафик. Вход оправдан только с арендой заметно ниже рынка или уникальным предложением.",
        }.get(comp, f"Уровень конкуренции: {comp}."),
        (
            f"Среднедушевой доход в регионе — {_money(income)} в месяц. "
            + (
                f"Бюджет запуска {_money(budget)} соответствует примерно {max(1, round(budget / income)) if income else '—'} среднемесячным доходам жителя — "
                + ("умеренная нагрузка для первого бизнеса." if income and budget / income < 30 else "существенная сумма: заложите подушку на 3 месяца работы в ноль.")
            )
            if income
            else f"Бюджет запуска — {_money(budget)}."
        ),
    ]
    paras[0] = f"Ниша «{niche_title}». " + paras[0]
    return paras


def build_risks_growth(md: Dict[str, Any]) -> Dict[str, List[str]]:
    """Риски и точки роста по тем же правилам, что использует движок отчётов."""
    risks: List[str] = []
    density = float(md.get("density_per_100k") or 0)
    comp = str(md.get("competition_level") or "средняя").lower()
    income = float(md.get("avg_income") or 0)
    budget = float(md.get("budget") or 0)

    if density > 6:
        risks.append(f"Насыщенность рынка: {density} точек на 100 тыс. жителей — трафик придётся отвоевывать.")
    if comp == "высокая":
        risks.append("Ценовые войны с действующими игроками могут давить маржу с первого месяца.")
    if income and income < 40_000:
        risks.append(f"Сдержанный платёжеспособный спрос: средний доход {_money(income)} в месяц.")
    if budget and budget < 1_000_000:
        risks.append("Бюджет впритык: нет подушки на 2–3 месяца операционного убытка.")
    risks.append("Сезонность спроса: запускаться лучше за 1–2 месяца до высокого сезона.")

    growth = [
        "Локация у стабильного пешеходного трафика — подтвердите точкой на карте конкурентов BizRadar.",
        "Дифференциация через сервис и часы работы, а не через цену.",
        "Программа лояльности и кросс-продажи для возврата клиента во вторую неделю.",
    ]
    if budget and budget >= 1_500_000:
        growth.append("Запас бюджета позволяет взять площадку с проходимостью на 15–20% выше средней.")
    return {"risks": risks[:4], "growth": growth}


def build_recommendations(md: Dict[str, Any], region: str) -> List[str]:
    return [
        "Забронировать 2–3 площадки и замерить реальный трафик в будни и выходные.",
        "Пересчитать юнит-экономику в модуле «Финансы» BizRadar с фактической арендой.",
        "Проверить прямых конкурентов в радиусе 500 м на карте и зафиксировать их часы работы.",
        f"Оформить ИП и подобрать ОКВЭД под нишу; проверить региональные меры поддержки ({region}).",
        "Запустить MVP на 4 недели и сверить фактическую выручку с расчётной до масштабирования.",
    ]


# --------------------------------------------------------------------- сборка
def build_pdf_context(
    *,
    niche_title: str,
    region: str,
    city_name: str,
    market_ Dict[str, Any],
    score: float,
    survival: int,
    report_text: str,
    report_source: str,
    snapshot_created: Optional[str],
    sections: List[str],
) -> Dict[str, Any]:
    """Полный контекст шаблона: титул, метрики, интерпретации, секции."""
    md = market_data
    ring_c = 2 * 3.14159265 * 54.0
    verdict = "Сильная ниша" if score >= 75 else ("Перспективная ниша" if score >= 55 else "Рискованная ниша")

    metrics = [
        ("Индекс выживаемости", f"{int(round(score))}/100", "скоринг BizRadar v1"),
        ("Вероятность пережить год", f"{survival}%", "эвристика выживаемости"),
        ("Прямых конкурентов", str(int(md.get("competitors_count") or 0)), "в радиусе анализа"),
        ("Плотность точек", f"{md.get('density_per_100k') or 0}", "на 100 тыс. жителей"),
        ("Средний доход", _money(md.get("avg_income") or 0), "на жителя в месяц"),
        ("Бюджет запуска", _money(md.get("budget") or 0), "заявлен предпринимателем"),
    ]

    return {
        "sections": sections,
        "section_meta": SECTION_REGISTRY,
        "brand": "BizRadar",
        "doc_title": f"{niche_title} — {city_name or region}",
        "niche_title": niche_title,
        "region": region,
        "city_name": city_name,
        "date_ru": datetime.now(timezone.utc).strftime("%d.%m.%Y"),
        "snapshot_note": (
            f"Снимок рынка от {snapshot_created}" if snapshot_created else "Снимок рынка: актуальные данные каталога"
        ),
        "source_note": "Отчёт ИИ: GigaChat" if report_source == "gigachat" else "Отчёт ИИ: эвристика v1 (GigaChat недоступен)",
        "score": int(round(score)),
        "score_dash": round(ring_c * max(0.02, min(1.0, score / 100.0)), 1),
        "ring_c": round(ring_c, 1),
        "survival": survival,
        "verdict": verdict,
        "metrics": metrics,
        "competition_level": str(md.get("competition_level") or "средняя"),
        "market_paragraphs": interpret_market(md, niche_title),
        "ai_html": Markup(markdown_to_html(report_text)),
        "risks": build_risks_growth(md)["risks"],
        "growth": build_risks_growth(md)["growth"],
        "recommendations": build_recommendations(md, region),
        "disclaimer": DISCLAIMER,
    }


class PdfEngineUnavailable(RuntimeError):
    """WeasyPrint/системные библиотеки недоступны — эндпоинт вернёт 503."""


def render_business_plan_pdf(ctx: Dict[str, Any]) -> bytes:
    """Рендер HTML-шаблона в PDF. Кириллица — через DejaVu Sans (см. модуль)."""
    try:
        from weasyprint import HTML
    except ImportError as exc:
        raise PdfEngineUnavailable(
            "WeasyPrint не установлен. Локально: pip install weasyprint "
            "(нужны системные pango/cairo); в Docker зависимости уже в образе."
        ) from exc

    env = Environment(
        loader=FileSystemLoader(_TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "j2"]),
    )
    template = env.get_template("business_plan.html.j2")
    html = template.render(**ctx)
    logger.info("Рендер PDF: %s (%d секций)", ctx["doc_title"], len(ctx["sections"]))
    return HTML(string=html).write_pdf()
