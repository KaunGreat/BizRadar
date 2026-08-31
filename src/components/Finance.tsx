import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { fmtMoney, fmtShort, type City, type Niche } from "../data";
import { useCountUp } from "../hooks";
import { apiFetch } from "../auth";
import { ICalc, IInfo, IRefresh, ITrendDown, ITrendUp, IWallet } from "./icons";

/* ------------------------------------------------------------------ типы */
interface FinParams {
  avg_check: number;
  clients_per_day: number;
  days_per_month: number;
  margin_pct: number;
  rent: number;
  staff: number;
  other_fixed: number;
  investment: number;
}

interface FinResults {
  revenue: number;
  gross_profit: number;
  fixed_costs: number;
  profit: number;
  breakeven_revenue: number | null;
  breakeven_clients_day: number | null;
  payback_months: number | null;
  profitability_pct: number | null;
}

interface SeriesPoint {
  month: number;
  revenue: number;
  expenses: number;
  cumulative: number;
}

interface FinMeta {
  source: "api" | "local";
  regionName?: string;
  avgIncome?: number | null;
  regionSource?: string;
  costFactor?: number;
  checkFactor?: number;
  note?: string;
}

/* Сохраняем сигнатуру, которую использует App.tsx (prefill больше не обязателен —
   осмысленные значения приходят из /api/v1/finance/model по нише+региону). */
export interface Prefill {
  check: number;
  startup: number;
  margin: number;
  title: string;
}

/* --------------------------------------------------- локальные пресеты (fallback,
   когда бэкенд недоступен) — тот же набор, что в backend/services/finance_model.py */
const LOCAL_PRESETS: Record<string, FinParams> = {
  coffee:       { avg_check: 290,   clients_per_day: 56, days_per_month: 26, margin_pct: 62, rent: 60_000,  staff: 88_000,  other_fixed: 26_000, investment: 1_400_000 },
  coffee_house: { avg_check: 640,   clients_per_day: 37, days_per_month: 26, margin_pct: 45, rent: 150_000, staff: 160_000, other_fixed: 50_000, investment: 4_800_000 },
  pizzeria:     { avg_check: 890,   clients_per_day: 36, days_per_month: 26, margin_pct: 48, rent: 110_000, staff: 145_000, other_fixed: 38_000, investment: 3_200_000 },
  shawarma:     { avg_check: 260,   clients_per_day: 52, days_per_month: 26, margin_pct: 58, rent: 40_000,  staff: 75_000,  other_fixed: 20_000, investment: 900_000 },
  nails:        { avg_check: 1450,  clients_per_day: 12, days_per_month: 26, margin_pct: 66, rent: 50_000,  staff: 135_000, other_fixed: 22_000, investment: 1_100_000 },
  barber:       { avg_check: 1100,  clients_per_day: 18, days_per_month: 26, margin_pct: 55, rent: 65_000,  staff: 115_000, other_fixed: 24_000, investment: 1_900_000 },
  lashes:       { avg_check: 1900,  clients_per_day: 6,  days_per_month: 26, margin_pct: 70, rent: 30_000,  staff: 90_000,  other_fixed: 17_500, investment: 700_000 },
  solarium:     { avg_check: 700,   clients_per_day: 13, days_per_month: 26, margin_pct: 50, rent: 40_000,  staff: 60_000,  other_fixed: 30_000, investment: 1_600_000 },
  kids_center:  { avg_check: 800,   clients_per_day: 22, days_per_month: 26, margin_pct: 42, rent: 45_000,  staff: 60_000,  other_fixed: 20_000, investment: 2_400_000 },
  robotics:     { avg_check: 650,   clients_per_day: 23, days_per_month: 26, margin_pct: 58, rent: 40_000,  staff: 70_000,  other_fixed: 21_000, investment: 1_700_000 },
  kindergarten: { avg_check: 22000, clients_per_day: 2,  days_per_month: 26, margin_pct: 30, rent: 150_000, staff: 230_000, other_fixed: 40_000, investment: 6_500_000 },
  clothes:      { avg_check: 2400,  clients_per_day: 8,  days_per_month: 26, margin_pct: 40, rent: 100_000, staff: 110_000, other_fixed: 30_000, investment: 2_800_000 },
  cosmetics:    { avg_check: 1300,  clients_per_day: 14, days_per_month: 26, margin_pct: 46, rent: 60_000,  staff: 80_000,  other_fixed: 19_000, investment: 2_100_000 },
  pet:          { avg_check: 1150,  clients_per_day: 14, days_per_month: 26, margin_pct: 38, rent: 35_000,  staff: 40_000,  other_fixed: 9_000,  investment: 1_500_000 },
  auto:         { avg_check: 5200,  clients_per_day: 5,  days_per_month: 26, margin_pct: 44, rent: 60_000,  staff: 100_000, other_fixed: 17_000, investment: 3_600_000 },
  cleaning:     { avg_check: 3800,  clients_per_day: 4,  days_per_month: 26, margin_pct: 52, rent: 25_000,  staff: 95_000,  other_fixed: 13_000, investment: 800_000 },
  dental:       { avg_check: 6800,  clients_per_day: 6,  days_per_month: 26, margin_pct: 35, rent: 90_000,  staff: 110_000, other_fixed: 21_000, investment: 7_200_000 },
  pharmacy:     { avg_check: 850,   clients_per_day: 27, days_per_month: 26, margin_pct: 25, rent: 80_000,  staff: 90_000,  other_fixed: 20_000, investment: 3_400_000 },
};

/* --------------------------------------------- математика (зеркало бэкенда) */
function computeModel(p: FinParams): FinResults {
  const check = Math.max(1, p.avg_check);
  const days = Math.max(1, p.days_per_month);
  const margin = p.margin_pct / 100;

  const revenue = check * p.clients_per_day * days;
  const gross = revenue * margin;
  const fixed = p.rent + p.staff + p.other_fixed;
  const profit = gross - fixed;

  const bepRevenue = margin > 0 ? fixed / margin : null;
  const bepClients = bepRevenue !== null ? bepRevenue / check / days : null;
  const payback = profit > 0 ? p.investment / profit : null;
  const profitability = revenue > 0 ? (profit / revenue) * 100 : null;

  return {
    revenue: Math.round(revenue),
    gross_profit: Math.round(gross),
    fixed_costs: Math.round(fixed),
    profit: Math.round(profit),
    breakeven_revenue: bepRevenue !== null ? Math.round(bepRevenue) : null,
    breakeven_clients_day: bepClients !== null ? Math.round(bepClients * 10) / 10 : null,
    payback_months: payback !== null ? Math.round(payback * 10) / 10 : null,
    profitability_pct: profitability !== null ? Math.round(profitability * 10) / 10 : null,
  };
}

function buildSeries(p: FinParams, r: FinResults, months = 12): SeriesPoint[] {
  const expenses = r.revenue - r.gross_profit + r.fixed_costs;
  return Array.from({ length: months }, (_, i) => ({
    month: i + 1,
    revenue: r.revenue,
    expenses: Math.round(expenses),
    cumulative: Math.round(-p.investment + r.profit * (i + 1)),
  }));
}

/* ------------------------------------------------------------ UI: слайдер */
function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] text-mut">{label}</span>
        <span className="font-display text-[13px] font-bold tabular text-ink">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ "--fill": `${fill}%` } as CSSProperties}
      />
      {hint && <div className="mt-1 text-[10.5px] leading-snug text-dim">{hint}</div>}
    </label>
  );
}

/* ------------------------------------------------------- график 12 месяцев */
function CashflowChart({ series, payback }: { series: SeriesPoint[]; payback: number | null }) {
  const W = 620;
  const H = 240;
  const padL = 48;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const barMax = Math.max(...series.map((s) => Math.max(s.revenue, s.expenses)));
  const cumMin = Math.min(0, ...series.map((s) => s.cumulative));
  const cumMax = Math.max(0, ...series.map((s) => s.cumulative));
  const yTop = Math.max(barMax, cumMax) * 1.08;
  const yBot = Math.min(-barMax * 0.05, cumMin * 1.08);

  const x = (m: number) => padL + ((m - 0.5) / series.length) * iw;
  const y = (v: number) => padT + ih - ((v - yBot) / (yTop - yBot)) * ih;
  const zeroY = y(0);
  const barW = (iw / series.length) * 0.3;

  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((rx - padL) / iw) * series.length - 0.5);
    setHover(Math.max(0, Math.min(series.length - 1, idx)));
  };

  const cumLine = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.month).toFixed(1)} ${y(s.cumulative).toFixed(1)}`).join(" ");
  const paybackX = payback !== null && payback <= series.length ? padL + ((payback - 0.5) / series.length) * iw : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* сетка и ось нуля */}
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const v = yBot + (yTop - yBot) * t;
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#14293c" strokeDasharray="3 5" />
              <text x={padL - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#5d7b90" className="tabular">
                {fmtShort(v)}
              </text>
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="#2a5378" strokeWidth="1.4" />

        {/* пары баров: выручка / расходы */}
        {series.map((s) => (
          <g key={s.month}>
            <rect
              x={x(s.month) - barW - 1}
              y={y(s.revenue)}
              width={barW}
              height={Math.max(2, zeroY - y(s.revenue))}
              rx="2"
              fill="#4cc9f0"
              opacity={hover === null || hover === s.month - 1 ? 0.85 : 0.35}
              className="bar-grow"
              style={{ animationDelay: `${s.month * 24}ms` }}
            />
            <rect
              x={x(s.month) + 1}
              y={y(s.expenses)}
              width={barW}
              height={Math.max(2, zeroY - y(s.expenses))}
              rx="2"
              fill="#ffc24b"
              opacity={hover === null || hover === s.month - 1 ? 0.8 : 0.35}
              className="bar-grow"
              style={{ animationDelay: `${s.month * 24 + 40}ms` }}
            />
            {(s.month === 1 || s.month % 3 === 0) && (
              <text x={x(s.month)} y={H - 9} textAnchor="middle" fontSize="10" fill="#5d7b90">
                {s.month} мес
              </text>
            )}
          </g>
        ))}

        {/* накопленный поток */}
        <path d={cumLine} fill="none" stroke="#a78bfa" strokeWidth="2.4" strokeLinejoin="round" pathLength={1} className="draw-line" />
        {series.map((s) => (
          <circle key={`d${s.month}`} cx={x(s.month)} cy={y(s.cumulative)} r={hover === s.month - 1 ? 4.5 : 3} fill="#06121c" stroke="#a78bfa" strokeWidth="2" />
        ))}

        {/* отметка окупаемости */}
        {paybackX !== null && (
          <g>
            <line x1={paybackX} x2={paybackX} y1={padT} y2={H - padB} stroke="#3ce6a4" strokeWidth="1.6" strokeDasharray="6 5" />
            <text x={paybackX + 5} y={padT + 11} fontSize="10.5" fontWeight="700" fill="#3ce6a4">
              окупаемость
            </text>
          </g>
        )}

        {hover !== null && (
          <line x1={x(series[hover].month)} x2={x(series[hover].month)} y1={padT} y2={H - padB} stroke="#4cc9f0" strokeOpacity="0.3" />
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-bg2/95 px-2.5 py-1.5 text-xs shadow-xl"
          style={{
            left: `${(x(series[hover].month) / W) * 100}%`,
            transform: hover > series.length / 2 ? "translateX(-110%)" : "translateX(12px)",
          }}
        >
          <div className="text-mut">Месяц {series[hover].month}</div>
          <div className="tabular" style={{ color: "#4cc9f0" }}>выручка {fmtShort(series[hover].revenue)}</div>
          <div className="tabular" style={{ color: "#ffc24b" }}>расходы {fmtShort(series[hover].expenses)}</div>
          <div className="tabular font-semibold" style={{ color: series[hover].cumulative >= 0 ? "#3ce6a4" : "#ff6d6d" }}>
            поток {fmtMoney(series[hover].cumulative)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- компонент */
export function Finance({ prefill, city, niche }: { prefill: Prefill | null; city: City; niche: Niche | null }) {
  const [params, setParams] = useState<FinParams | null>(null);
  const [meta, setMeta] = useState<FinMeta>({ source: "local" });
  const [loading, setLoading] = useState(true);

  const loadPrefill = useCallback(async () => {
    if (!niche) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/finance/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche.id, region: city.name, params: null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { params: FinParams; meta: Record<string, any> };
      setParams(j.params);
      setMeta({
        source: "api",
        regionName: j.meta?.region?.name,
        avgIncome: j.meta?.region?.avg_income,
        regionSource: j.meta?.region?.source,
        costFactor: j.meta?.cost_factor,
        checkFactor: j.meta?.check_factor,
        note: j.meta?.note,
      });
    } catch {
      setParams(LOCAL_PRESETS[niche.id] ?? LOCAL_PRESETS.coffee);
      setMeta({ source: "local" });
    } finally {
      setLoading(false);
    }
  }, [niche, city]);

  useEffect(() => {
    loadPrefill();
  }, [loadPrefill]);

  const results = useMemo(() => (params ? computeModel(params) : null), [params]);
  const series = useMemo(() => (params && results ? buildSeries(params, results) : []), [params, results]);

  if (!niche) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-line bg-bg1/50 text-[13px] text-dim">
        Выберите нишу на радаре и нажмите «Рассчитать экономику».
      </div>
    );
  }

  const set = (k: keyof FinParams) => (v: number) => setParams((p) => (p ? { ...p, [k]: v } : p));
  const loss = results !== null && results.profit <= 0;

  return (
    <div className="space-y-5">
      {/* заголовок */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <ICalc size={18} className="text-sig" />
            <h2 className="font-display text-[16px] font-bold">{niche.title}</h2>
            <span className="rounded border border-line bg-bg2 px-2 py-0.5 text-[10.5px] text-mut">{city.name}</span>
          </div>
          <p className="mt-1 text-[12px] text-dim">
            Юнит-экономика точки: правьте параметры — показатели пересчитываются мгновенно.
          </p>
        </div>
        <span
          className="rounded-md border px-2.5 py-1.5 text-[11px] font-bold"
          style={
            meta.source === "api"
              ? { borderColor: "#3ce6a450", background: "#3ce6a410", color: "#3ce6a4" }
              : { borderColor: "#a78bfa50", background: "#a78bfa0f", color: "#a78bfa" }
          }
        >
          {meta.source === "api" ? "префилл: бэкенд · ниша + регион" : "локальный расчёт · бэкенд недоступен"}
        </span>
        <button
          onClick={loadPrefill}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[12px] font-semibold text-mut transition hover:border-cy/50 hover:text-cy"
        >
          <IRefresh size={14} className={loading ? "animate-spin" : ""} /> Сбросить к пресету
        </button>
      </div>

      {/* региональная поправка */}
      {meta.source === "api" && meta.costFactor !== undefined && (
        <div className="flex items-start gap-2 rounded-lg border border-cy/25 bg-cy/[0.05] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-mut">
          <IInfo size={14} className="mt-0.5 shrink-0 text-cy" />
          <span>
            Региональная поправка <b className="text-cy">×{meta.costFactor}</b> к издержкам (аренда, ФОТ, прочие)
            {meta.checkFactor !== undefined && <> и <b className="text-cy">×{meta.checkFactor}</b> к чеку</>}
            {" "}по доходу {meta.regionName ?? city.name}
            {meta.avgIncome ? ` (${fmtMoney(meta.avgIncome)}/чел, ${meta.regionSource})` : ""}. Спрос не масштабируется — консервативная оценка.
          </span>
        </div>
      )}

      {loading || !params || !results ? (
        <div className="grid gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-bg2" style={{ animationDelay: `${i * 110}ms` }} />
          ))}
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="panel rounded-xl p-4" style={{ boxShadow: loss ? "0 0 24px -12px rgba(255,109,109,.5)" : "0 0 24px -12px rgba(60,230,164,.5)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.16em] text-dim">Прибыль / мес</span>
                {loss ? <ITrendDown size={15} className="text-cor" /> : <ITrendUp size={15} className="text-sig" />}
              </div>
              <BigMoney value={results.profit} color={loss ? "#ff6d6d" : "#3ce6a4"} />
              <div className="mt-1 text-[11px] text-dim tabular">маржа {fmtShort(results.gross_profit)} − постоянные {fmtShort(results.fixed_costs)}</div>
            </div>

            <div className="panel rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-dim">Точка безубыточности</div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular text-cy">
                {results.breakeven_clients_day !== null ? `${results.breakeven_clients_day} кл/д` : "—"}
              </div>
              <div className="mt-1 text-[11px] text-dim tabular">
                {results.breakeven_revenue !== null ? `или ${fmtMoney(results.breakeven_revenue)} выручки` : "маржа ≤ 0"}
              </div>
            </div>

            <div className="panel rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-dim">Срок окупаемости</div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular" style={{ color: results.payback_months === null ? "#ff6d6d" : results.payback_months <= 18 ? "#3ce6a4" : "#ffc24b" }}>
                {results.payback_months === null ? "∞" : `${results.payback_months} мес`}
              </div>
              <div className="mt-1 text-[11px] text-dim tabular">инвестиции {fmtShort(params.investment)}</div>
            </div>

            <div className="panel rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-dim">Рентабельность</div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular" style={{ color: (results.profitability_pct ?? 0) <= 0 ? "#ff6d6d" : "#3ce6a4" }}>
                {results.profitability_pct === null ? "—" : `${results.profitability_pct}%`}
              </div>
              <div className="mt-1 text-[11px] text-dim tabular">прибыль / выручка {fmtShort(results.revenue)}</div>
            </div>
          </div>

          {/* предупреждение об убытке */}
          {loss && (
            <div className="anim-rise flex items-start gap-3 rounded-xl border border-cor/40 bg-cor/[0.07] p-4">
              <IWallet size={20} className="mt-0.5 shrink-0 text-cor" />
              <div>
                <div className="font-display text-[13px] font-bold text-cor">При текущих параметрах точка убыточна</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-mut">
                  Постоянные расходы ({fmtMoney(results.fixed_costs)}) выше валовой маржи ({fmtMoney(results.gross_profit)}) —
                  ежемесячный минус {fmtMoney(Math.abs(results.profit))}, вложения не окупаются.
                  Увеличьте чек или поток клиентов, поднимите маржу либо сократите аренду и ФОТ.
                </p>
              </div>
            </div>
          )}

          {/* форма + график */}
          <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <div className="panel space-y-4 rounded-xl p-5">
              <Slider label="Средний чек" value={params.avg_check} min={50} max={25000} step={10} format={fmtMoney} onChange={set("avg_check")} />
              <Slider
                label="Клиентов в день"
                value={params.clients_per_day}
                min={0}
                max={200}
                step={1}
                format={(v) => `${v}`}
                hint={
                  results.breakeven_clients_day !== null
                    ? `безубыточность при ${results.breakeven_clients_day} кл/д`
                    : undefined
                }
                onChange={set("clients_per_day")}
              />
              <Slider label="Рабочих дней в месяц" value={params.days_per_month} min={10} max={31} step={1} format={(v) => `${v}`} onChange={set("days_per_month")} />
              <Slider label="Маржа (% выручки)" value={params.margin_pct} min={5} max={90} step={1} format={(v) => `${v}%`} onChange={set("margin_pct")} />
              <div className="h-px bg-linesoft" />
              <Slider label="Аренда / мес" value={params.rent} min={0} max={600000} step={5000} format={fmtMoney} onChange={set("rent")} />
              <Slider label="ФОТ / мес" value={params.staff} min={0} max={800000} step={5000} format={fmtMoney} onChange={set("staff")} />
              <Slider label="Прочие постоянные / мес" value={params.other_fixed} min={0} max={400000} step={5000} format={fmtMoney} onChange={set("other_fixed")} />
              <div className="h-px bg-linesoft" />
              <Slider label="Стартовые инвестиции" value={params.investment} min={100000} max={10000000} step={50000} format={fmtMoney} onChange={set("investment")} />
            </div>

            <div className="panel rounded-xl p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-mut">Выручка vs расходы · 12 мес</h3>
                <div className="flex items-center gap-3 text-[10.5px] text-dim">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-cy" />выручка</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-amb" />расходы</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-vio" />накопленный поток</span>
                </div>
              </div>
              <CashflowChart series={series} payback={results.payback_months} />
              <p className="mt-2 text-[11px] leading-relaxed text-dim">
                Расходы = переменные (выручка − маржа) + постоянные. Фиолетовая линия — накопленный денежный поток с учётом
                инвестиций; пересечение нуля{results.payback_months !== null ? ` на ${results.payback_months}-м месяце` : ""} — выход в плюс.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BigMoney({ value, color }: { value: number; color: string }) {
  const v = useCountUp(value, 700);
  return (
    <div className="mt-1.5 font-display text-[22px] font-bold tabular" style={{ color }}>
      {fmtMoney(v)}
    </div>
  );
}
