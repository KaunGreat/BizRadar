import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { fmtMoney, fmtShort, type City, type Niche } from "../data";
import { useCountUp } from "../hooks";
import { BarsChart } from "./charts";
import { ICalc, IRefresh } from "./icons";

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs text-mut">{label}</span>
        <span className="font-display text-[13px] font-semibold text-ink tabular">{format(value)}</span>
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
    </label>
  );
}

export interface Prefill {
  check: number;
  startup: number;
  margin: number;
  title: string;
}

export function Finance({ prefill, city, niche }: { prefill: Prefill | null; city: City; niche: Niche | null }) {
  const [check, setCheck] = useState(900);
  const [clients, setClients] = useState(14);
  const [margin, setMargin] = useState(55);
  const [rent, setRent] = useState(80_000);
  const [staff, setStaff] = useState(140_000);
  const [mkt, setMkt] = useState(30_000);
  const [other, setOther] = useState(25_000);
  const [invest, setInvest] = useState(1_200_000);

  useEffect(() => {
    if (prefill) {
      setCheck(Math.round((prefill.check * (1 + (city.k - 1) * 0.3)) / 10) * 10);
      setInvest(Math.round((prefill.startup * (1 + (city.k - 1) * 0.5)) / 10_000) * 10_000);
      setMargin(prefill.margin);
    }
  }, [prefill, city]);

  const rev = check * clients * 30;
  const gross = (rev * margin) / 100;
  const fixed = rent + staff + mkt + other;
  const profit = gross - fixed;
  const beDaily = check * (margin / 100) > 0 ? fixed / (check * (margin / 100)) : Infinity;
  const payback = profit > 0 ? invest / profit : null;

  const cashflow = useMemo(() => Array.from({ length: 24 }, (_, i) => Math.round(-invest + profit * (i + 1))), [invest, profit]);

  const profitAnim = useCountUp(profit);
  const revAnim = useCountUp(rev);

  const verdict =
    profit <= 0
      ? { text: "Убыточная модель: постоянные расходы выше валовой маржи. Поднимите чек, маржу или трафик.", color: "#ff6d6d", label: "Модель не сходится" }
      : payback !== null && payback <= 14
      ? { text: "Сильная модель: окупаемость быстрее 14 месяцев при текущих допущениях. Ниша проходит фильтр радара.", color: "#3ce6a4", label: "Сильная модель" }
      : payback !== null && payback <= 26
      ? { text: "Рабочая модель с умеренным горизонтом. Чувствительна к аренде и ФОТ — заложите подушку на 3 месяца.", color: "#ffc24b", label: "Умеренная модель" }
      : { text: "Долгая окупаемость: вложения возвращаются дольше 26 месяцев. Для первого бизнеса — высокий риск.", color: "#ff8a5c", label: "Долгий возврат" };

  const reset = () => {
    setCheck(900); setClients(14); setMargin(55); setRent(80_000); setStaff(140_000); setMkt(30_000); setOther(25_000); setInvest(1_200_000);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
      {/* inputs */}
      <div className="panel rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 font-display text-sm font-bold">
            <ICalc size={17} className="text-sig" /> Параметры модели
          </h3>
          <button onClick={reset} className="inline-flex items-center gap-1.5 text-[11px] text-mut transition hover:text-ink">
            <IRefresh size={13} /> Сброс
          </button>
        </div>

        {prefill && (
          <div className="mb-4 rounded-lg border border-sig/25 bg-sig/[0.06] px-3 py-2 text-[11.5px] text-sig">
            Подставлены базовые значения ниши «{prefill.title}» для г. {city.name}
          </div>
        )}

        <div className="space-y-4">
          <Slider label="Средний чек" value={check} min={150} max={5000} step={10} format={fmtMoney} onChange={setCheck} />
          <Slider label="Клиентов в день" value={clients} min={2} max={120} step={1} format={(v) => `${v}`} onChange={setClients} />
          <Slider label="Маржинальность" value={margin} min={20} max={80} step={1} format={(v) => `${v}%`} onChange={setMargin} />
          <div className="h-px bg-linesoft" />
          <Slider label="Аренда / мес" value={rent} min={20_000} max={400_000} step={5_000} format={fmtMoney} onChange={setRent} />
          <Slider label="ФОТ / мес" value={staff} min={0} max={600_000} step={10_000} format={fmtMoney} onChange={setStaff} />
          <Slider label="Маркетинг / мес" value={mkt} min={0} max={250_000} step={5_000} format={fmtMoney} onChange={setMkt} />
          <Slider label="Прочие расходы / мес" value={other} min={0} max={200_000} step={5_000} format={fmtMoney} onChange={setOther} />
          <div className="h-px bg-linesoft" />
          <Slider label="Вложения на старте" value={invest} min={300_000} max={6_000_000} step={50_000} format={fmtMoney} onChange={setInvest} />
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-dim">
          Учебная модель модуля Finance. Не учитывает налоги и сезонность — сверяйтесь с графиком спроса в карточке ниши
          {niche ? ` («${niche.title}»)` : ""}.
        </p>
      </div>

      {/* results */}
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="panel rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-dim">Выручка / мес</div>
            <div className="mt-1.5 font-display text-xl font-bold tabular text-ink">{fmtMoney(revAnim)}</div>
            <div className="mt-1 text-[11px] text-dim tabular">{check} ₽ × {clients} кл/день</div>
          </div>
          <div className="panel rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-dim">Прибыль / мес</div>
            <div className="mt-1.5 font-display text-xl font-bold tabular" style={{ color: profit >= 0 ? "#3ce6a4" : "#ff6d6d" }}>
              {fmtMoney(profitAnim)}
            </div>
            <div className="mt-1 text-[11px] text-dim tabular">постоянные: {fmtShort(fixed)}</div>
          </div>
          <div className="panel rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-dim">Безубыточность</div>
            <div className="mt-1.5 font-display text-xl font-bold tabular text-cy">{beDaily === Infinity ? "—" : `${Math.ceil(beDaily)} кл/д`}</div>
            <div className="mt-1 text-[11px] text-dim">клиентов в день</div>
          </div>
          <div className="panel rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-dim">Окупаемость</div>
            <div className="mt-1.5 font-display text-xl font-bold tabular" style={{ color: payback === null ? "#ff6d6d" : payback <= 14 ? "#3ce6a4" : "#ffc24b" }}>
              {payback === null ? "∞" : `${Math.round(payback)} мес`}
            </div>
            <div className="mt-1 text-[11px] text-dim tabular">вложения {fmtShort(invest)}</div>
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{ borderColor: `${verdict.color}44`, background: `${verdict.color}0d` }}>
          <div className="font-display text-[13px] font-bold" style={{ color: verdict.color }}>{verdict.label}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-mut">{verdict.text}</p>
        </div>

        <div className="panel rounded-xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-mut">Накопленный денежный поток · 24 мес</h3>
            <span className="text-[11px] text-dim tabular">старт: −{fmtShort(invest)}</span>
          </div>
          <BarsChart data={cashflow} format={fmtMoney} />
        </div>
      </div>
    </div>
  );
}
