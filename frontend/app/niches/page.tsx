"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type Niche = {
  id: string;
  title: string;
  category: string;
  score: number;
  delta: number;
  survival: number;
  monthly_revenue: number;
  margin_pct: number;
  startup_cost: number;
  avg_check: number;
  tags: string[];
  market_data: {
    competitors_count: number;
    density_per_100k: number;
    competition_level: string;
    avg_income: number;
    budget: number;
  };
};

type Report = { report: string; source: "gigachat" | "stub" };

const scoreColor = (s: number) => (s >= 75 ? "#3ce6a4" : s >= 55 ? "#ffc24b" : "#ff6d6d");
const fmtMoney = (v: number) => v.toLocaleString("ru-RU") + " ₽";
const fmtShort = (v: number) =>
  v >= 1_000_000 ? (v / 1_000_000).toFixed(1).replace(".", ",") + " млн" : Math.round(v / 1_000) + " тыс";

/* ---------- мини-рендерер Markdown отчёта ---------- */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  let ol = 0;
  return (
    <div className="space-y-1.5">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) {
          ol = 0;
          return <div key={i} className="h-2" />;
        }
        if (line.startsWith("# "))
          return (
            <h3 key={i} className="pt-1 font-display text-[15px] font-bold leading-snug">
              {inline(line.slice(2))}
            </h3>
          );
        if (line.startsWith("## "))
          return (
            <div key={i} className="mt-3 flex items-center gap-2">
              <span className="h-3.5 w-1 rounded-full bg-sig" />
              <h4 className="font-display text-[12px] font-bold uppercase tracking-[0.12em] text-sig">{line.slice(3)}</h4>
            </div>
          );
        if (line.startsWith("> "))
          return (
            <p key={i} className="rounded-md border border-amb/35 bg-amb/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amb">
              {inline(line.slice(2))}
            </p>
          );
        if (line.startsWith("- "))
          return (
            <p key={i} className="flex gap-2 pl-1 text-[12.5px] leading-relaxed text-mut">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cy" />
              <span>{inline(line.slice(2))}</span>
            </p>
          );
        const num = line.match(/^(\d+)\.\s+(.*)$/);
        if (num)
          return (
            <p key={i} className="flex gap-2.5 pl-1 text-[12.5px] leading-relaxed text-mut">
              <span className="font-mono text-[11px] font-bold text-sig">{num[1]}.</span>
              <span>{inline(num[2])}</span>
            </p>
          );
        return (
          <p key={i} className="text-[12.5px] leading-relaxed text-mut">
            {inline(line)}
          </p>
        );
      })}
    </div>
  );
}

/* ---------- страница ---------- */
export default function NichesPage() {
  const [niches, setNiches] = useState<Niche[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("coffee");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/niches")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        setNiches(j.items as Niche[]);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  const selected = useMemo(() => niches?.find((n) => n.id === selectedId) ?? niches?.[0] ?? null, [niches, selectedId]);

  const generate = async () => {
    if (!selected || loading) return;
    setLoading(true);
    setReport(null);
    setReportError(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: selected.title,
          region: "Томская область, г. Томск",
          market_data: selected.market_data,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Report;
      setReport({ report: j.report, source: j.source });
      setElapsedMs(Math.round(performance.now() - t0));
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "сеть недоступна");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-mut transition hover:border-cy/50 hover:text-cy">
            ← деплой-юнит
          </Link>
          <div>
            <h1 className="font-display text-xl font-extrabold">Нишевый радар</h1>
            <p className="text-[11.5px] text-dim">данные бэкенда · GET /api/niches → rewrite → api:8000</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg1 px-3 py-2 text-[11.5px] text-mut">
          <span className={`h-2 w-2 rounded-full ${niches ? "bg-sig" : loadError ? "bg-cor" : "bg-amb"} pulse-dot`} />
          {niches ? `онлайн · ${niches.length} ниш` : loadError ? "бэкенд недоступен" : "запрос к api…"}
        </span>
      </header>

      {loadError && (
        <div className="anim-rise mb-5 rounded-xl border border-cor/40 bg-cor/[0.07] p-4 text-[13px] leading-relaxed text-cor">
          Не удалось получить /api/niches. Проверьте: контейнеры подняты (<code className="font-mono">docker compose ps</code>),
          в <code className="font-mono">next.config.js</code> проксирует <code className="font-mono">BACKEND_INTERNAL_URL</code>
          {" "}на внутренний адрес api. Логи: <code className="font-mono">docker compose logs frontend api</code>.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        {/* список */}
        <div className="panel overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[10.5px] uppercase tracking-[0.16em] text-dim">
            <span>Ниша · категория</span>
            <span className="hidden sm:block">балл · Δ · выручка</span>
          </div>
          {!niches && !loadError && (
            <div className="space-y-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-linesoft px-4 py-3.5 last:border-0">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-bg3" style={{ animationDelay: `${i * 90}ms` }} />
                  <div className="ml-auto h-6 w-12 animate-pulse rounded bg-bg3" />
                </div>
              ))}
            </div>
          )}
          <div className="max-h-[640px] overflow-y-auto scroll-slim">
            {niches?.map((n, i) => {
              const c = scoreColor(n.score);
              const active = selected?.id === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setSelectedId(n.id);
                    setReport(null);
                    setReportError(null);
                  }}
                  className={`flex w-full items-center gap-3 border-b border-linesoft px-4 py-3 text-left transition last:border-0 ${
                    active ? "bg-bg2" : "hover:bg-bg2/50"
                  }`}
                >
                  <span className="w-5 shrink-0 font-display text-[11px] font-bold text-dim tabular">{i + 1}</span>
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}55` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{n.title}</span>
                    <span className="text-[10.5px] text-dim">{n.category} · {n.tags.join(" · ")}</span>
                  </span>
                  <span className="hidden shrink-0 text-right sm:block">
                    <span className="flex items-center justify-end gap-1.5">
                      <span className={`text-[10.5px] font-semibold tabular ${n.delta >= 0 ? "text-sig" : "text-cor"}`}>
                        {n.delta >= 0 ? "▲" : "▼"} {Math.abs(n.delta)}
                      </span>
                      <span className="font-display text-[13.5px] font-bold tabular" style={{ color: c }}>
                        {n.score}
                      </span>
                    </span>
                    <span className="text-[10.5px] text-dim tabular">{fmtShort(n.monthly_revenue)}/мес</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* отчёт */}
        <div ref={panelRef} className="lg:sticky lg:top-6 lg:self-start">
          <div className="panel rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-dim">выбранная ниша</div>
                <h2 className="mt-1 font-display text-[16px] font-bold leading-tight">{selected?.title ?? "—"}</h2>
              </div>
              {selected && (
                <span
                  className="shrink-0 rounded-lg px-2.5 py-1.5 font-display text-[14px] font-bold tabular"
                  style={{ color: scoreColor(selected.score), background: `${scoreColor(selected.score)}14`, border: `1px solid ${scoreColor(selected.score)}33` }}
                >
                  {selected.score}
                </span>
              )}
            </div>

            {selected && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  [`${selected.market_data.competitors_count}`, "конкурентов"],
                  [String(selected.market_data.density_per_100k), "на 100 тыс."],
                  [selected.market_data.competition_level, "конкуренция"],
                ].map(([v, l]) => (
                  <div key={l} className="panel-soft rounded-lg px-2 py-2.5">
                    <div className="font-display text-[13.5px] font-bold tabular">{v}</div>
                    <div className="mt-0.5 text-[9.5px] uppercase tracking-wider text-dim">{l}</div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={generate}
              disabled={!selected || loading}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sig py-3 font-display text-[13px] font-bold text-bg0 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
            >
              {loading ? (
                <>
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 rounded-full bg-bg0 pulse-dot" style={{ animationDelay: `${d * 0.18}s` }} />
                    ))}
                  </span>
                  GigaChat думает…
                </>
              ) : (
                "Сгенерировать отчёт"
              )}
            </button>
            <p className="mt-2 text-center text-[10.5px] text-dim">POST /api/report · market_data ниши уходит в промпт целиком</p>
          </div>

          {/* результат */}
          {(loading || report || reportError) && (
            <div className="panel anim-rise mt-4 rounded-xl p-5">
              {report && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider"
                    style={
                      report.source === "gigachat"
                        ? { borderColor: "#3ce6a455", background: "#3ce6a412", color: "#3ce6a4" }
                        : { borderColor: "#ffc24b55", background: "#ffc24b10", color: "#ffc24b" }
                    }
                  >
                    источник: {report.source === "gigachat" ? "GigaChat" : "эвристика (заглушка)"}
                  </span>
                  {elapsedMs !== null && <span className="font-mono text-[10.5px] text-dim tabular">{(elapsedMs / 1000).toFixed(1)}s</span>}
                </div>
              )}
              {loading && (
                <div className="space-y-2.5">
                  {[90, 100, 70, 95, 60].map((w, i) => (
                    <div key={i} className="h-3 animate-pulse rounded bg-bg3" style={{ width: `${w}%`, animationDelay: `${i * 110}ms` }} />
                  ))}
                </div>
              )}
              {report && <Markdown text={report.report} />}
              {reportError && (
                <p className="text-[12.5px] leading-relaxed text-cor">
                  Отчёт не получен: {reportError}. Бэкенд должен отдавать заглушку при любом сбое LLM — значит, проблема в сети
                  между контейнерами (см. логи <code className="font-mono">docker compose logs api</code>).
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-dim">
        Маршрут запроса: браузер → Caddy :443 → frontend :3000 → Next rewrite → http://api:8000/api/report. Порт бэкенда наружу не
        проброшен (expose), поэтому прямой вызов с сервера по :8000 невозможен — только через домен.
      </p>
    </div>
  );
}
