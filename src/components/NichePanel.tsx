import { useState } from "react";
import {
  CATEGORY_COLOR,
  MONTHS,
  fmtMoney,
  fmtShort,
  scoreColor,
  scoreLabel,
  type City,
  type Niche,
} from "../data";
import { useTypewriter } from "../hooks";
import { saveProject } from "../projects";
import { AreaChart, PentagonRadar, ScoreRing } from "./charts";
import { IArrowR, IBolt, IClock, ICpu, IMap, IRefresh, IStar, ITrendDown, ITrendUp, IX } from "./icons";

function InsightText({ text }: { text: string }) {
  const { out, done } = useTypewriter(text, 10);
  return (
    <p className="text-[13px] leading-relaxed text-ink/90">
      {out}
      {!done && <span className="cursor-blink ml-0.5 inline-block h-3.5 w-[7px] translate-y-0.5 bg-sig" />}
    </p>
  );
}

export function NichePanel({
  niche,
  city,
  onClose,
  onFinance,
  onMap,
  onToast,
  onOpenHistory,
}: {
  niche: Niche;
  city: City;
  onClose: () => void;
  onFinance: () => void;
  onMap: () => void;
  onToast: (msg: string) => void;
  onOpenHistory: () => void;
}) {
  const [nonce, setNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* Сохранить анализ: пробуем получить ИИ-отчёт, кладём снимок в историю.
     Без бэкенда отчёт деградирует до эвристики — сохранение работает всегда. */
  const saveAnalysis = async () => {
    if (saving || saved) return;
    setSaving(true);
    let report = niche.insight;
    let reportSource: "gigachat" | "stub" = "stub";
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const incomeByCity: Record<string, number> = { "Томск": 48_500, "Новосибирск": 52_000, "Москва": 97_000 };
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          niche: niche.title,
          region: city.name,
          market_data: {
            competitors_count: niche.competitors.length,
            density_per_100k: Math.round((niche.competitors.length / 5.56) * 10) / 10,
            competition_level: niche.breakdown.competition >= 60 ? "низкая" : niche.breakdown.competition >= 45 ? "средняя" : "высокая",
            avg_income: incomeByCity[city.name] ?? 48_500,
            budget: niche.startup,
          },
        }),
      });
      clearTimeout(timer);
      if (res.ok) {
        const j = await res.json();
        if (j.report) {
          report = j.report;
          reportSource = j.source === "gigachat" ? "gigachat" : "stub";
        }
      }
    } catch {
      /* нет бэкенда/таймаут — сохраняем эвристический отчёт */
    }
    const r = await saveProject({
      niche_id: niche.id,
      niche_title: niche.title,
      city: city.name,
      city_name: city.name,
      score: niche.score,
      survival: niche.survival,
      snapshot: {
        category: niche.category,
        breakdown: niche.breakdown,
        score: niche.score,
        delta: niche.delta,
        monthly: niche.monthly,
        margin: niche.margin,
        startup: niche.startup,
        avgCheck: niche.avgCheck,
        survival: niche.survival,
        demand: niche.demand,
        tags: niche.tags,
        insight: niche.insight,
        report,
        report_source: reportSource,
      },
    });
    setSaving(false);
    setSaved(true);
    onToast(r.source === "api" ? `«${niche.title}» сохранён в историю (сервер)` : `«${niche.title}» сохранён в историю (в браузере)`);
  };
  const col = scoreColor(niche.score);
  const catCol = CATEGORY_COLOR[niche.category];
  const rev = niche.monthly * city.k;
  const check = niche.avgCheck * (1 + (city.k - 1) * 0.3);

  const bd = [
    { label: "Спрос", value: niche.breakdown.demand },
    { label: "Конкуренция", value: niche.breakdown.competition },
    { label: "Маржа", value: niche.breakdown.margin },
    { label: "Вход", value: niche.breakdown.entry },
    { label: "Тренд", value: niche.breakdown.trend },
  ];

  const topComp = [...niche.competitors].sort((a, b) => b.rating - a.rating).slice(0, 3);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg0/70 backdrop-blur-[3px] anim-fade" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[500px] overflow-y-auto scroll-slim border-l border-line bg-bg1 anim-panel">
        {/* header */}
        <div className="sticky top-0 z-10 border-b border-line bg-bg1/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: `${catCol}1f`, color: catCol, border: `1px solid ${catCol}44` }}
                >
                  {niche.category}
                </span>
                {niche.tags.map((t) => (
                  <span key={t} className="rounded border border-line px-2 py-0.5 text-[10px] text-mut">
                    {t}
                  </span>
                ))}
              </div>
              <h2 className="mt-2 font-display text-xl font-bold leading-tight">{niche.title}</h2>
              <div className="mt-1 text-xs text-mut">{city.name} · снимок рынка · эвристика выживаемости v1</div>
            </div>
            <button
              onClick={onClose}
              className="rounded-md border border-line p-2 text-mut transition hover:border-cor/60 hover:text-cor"
              aria-label="Закрыть"
            >
              <IX size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* score + radar */}
          <div className="flex items-center gap-5">
            <ScoreRing value={niche.score} color={col} sub="балл ниши" />
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold" style={{ background: `${col}17`, color: col }}>
                {niche.delta >= 0 ? <ITrendUp size={14} /> : <ITrendDown size={14} />}
                {niche.delta >= 0 ? "+" : ""}
                {niche.delta} п. за квартал
              </div>
              <div className="mt-2 font-display text-sm font-semibold" style={{ color: col }}>
                {scoreLabel(niche.score)}
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-mut">
                  <span>Выживаемость 1 год</span>
                  <span className="tabular font-semibold text-ink">{niche.survival}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg3">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${niche.survival}%`, background: col }} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr] sm:items-center panel-soft rounded-xl p-4">
            <PentagonRadar values={bd} color={col} size={210} />
            <div className="space-y-2">
              {bd.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-mut">{b.label}</span>
                    <span className="tabular font-semibold text-ink">{b.value}</span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-bg3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${b.value}%`,
                        background: b.value >= 65 ? "#3ce6a4" : b.value >= 45 ? "#ffc24b" : "#ff6d6d",
                        transition: "width .8s cubic-bezier(.2,.7,.3,1)",
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[10.5px] leading-relaxed text-dim">
                «Конкуренция» и «Вход» — инвертированные метрики: выше балл — легче войти.
              </p>
            </div>
          </div>

          {/* demand */}
          <div className="panel-soft rounded-xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-mut">Индекс спроса · 12 мес</h3>
              <span className="text-[11px] text-dim tabular">у.е. запросов / мес</span>
            </div>
            <AreaChart data={niche.demand} color={col} labels={MONTHS} format={(v) => fmtShort(v)} />
          </div>

          {/* numbers */}
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Выручка / мес (оценка)", fmtMoney(rev), col],
              ["Средний чек", fmtMoney(check), "#e9f4f8"],
              ["Вложения на старте", fmtMoney(niche.startup * (1 + (city.k - 1) * 0.5)), "#e9f4f8"],
              ["Маржинальность", `${niche.margin}%`, "#3ce6a4"],
            ].map(([l, v, c]) => (
              <div key={l} className="panel-soft rounded-lg p-3.5">
                <div className="text-[10px] uppercase tracking-wider text-dim">{l}</div>
                <div className="mt-1 font-display text-lg font-bold tabular" style={{ color: c }}>
                  {v}
                </div>
              </div>
            ))}
          </div>

          {/* ai insight */}
          <div className="rounded-xl border border-sig/25 bg-sig/[0.05] p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-sig">
                <ICpu size={15} /> ИИ-инсайт по нише
              </span>
              <span className="rounded border border-line bg-bg2 px-2 py-0.5 text-[10px] font-mono text-mut">
                RussianLLM · GigaChat (fallback: заглушка)
              </span>
            </div>
            <InsightText key={`${niche.id}-${nonce}`} text={niche.insight} />
            <button onClick={() => setNonce((v) => v + 1)} className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-sig/80 transition hover:text-sig">
              <IBolt size={13} /> Сгенерировать заново
            </button>
          </div>

          {/* competitors preview */}
          <div className="panel-soft rounded-xl p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-mut">Конкуренты · OSM</h3>
              <span className="text-[11px] tabular text-dim">{niche.competitors.length} точек на карте</span>
            </div>
            {topComp.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-linesoft py-2 last:border-0">
                <span className="text-[13px]">{c.name}</span>
                <span className="inline-flex items-center gap-1 text-xs text-amb tabular">
                  <IStar size={13} /> {c.rating.toFixed(1)}
                </span>
              </div>
            ))}
            <button
              onClick={onMap}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cy/40 py-2.5 text-sm font-semibold text-cy transition hover:bg-cy/10"
            >
              <IMap size={16} /> Открыть карту конкурентов
            </button>
          </div>

          {/* actions */}
          <div className="flex flex-col gap-2.5 pb-4">
            <button
              onClick={onFinance}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sig py-3 font-display text-[13px] font-bold text-bg0 transition hover:brightness-110 active:scale-[0.98]"
            >
              Рассчитать экономику <IArrowR size={16} />
            </button>
            <div className="flex gap-2.5">
              <button
                onClick={saveAnalysis}
                disabled={saving || saved}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-[12.5px] font-bold transition active:scale-[0.98] ${
                  saved
                    ? "cursor-default border-sig/40 bg-sig/10 text-sig"
                    : "border-line bg-bg2 text-ink hover:border-sig/50 hover:text-sig disabled:opacity-60"
                }`}
              >
                {saving ? (
                  <>
                    <IRefresh size={15} className="animate-spin" /> Сохраняем…
                  </>
                ) : saved ? (
                  <>
                    <IClock size={15} /> В истории
                  </>
                ) : (
                  <>
                    <IStar size={15} /> Сохранить анализ
                  </>
                )}
              </button>
              {saved && (
                <button
                  onClick={onOpenHistory}
                  className="anim-fade inline-flex items-center justify-center gap-2 rounded-lg border border-sig/50 px-4 py-2.5 text-[12.5px] font-bold text-sig transition hover:bg-sig/10 active:scale-[0.98]"
                >
                  Открыть <IArrowR size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
