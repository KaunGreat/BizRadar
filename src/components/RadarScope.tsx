import { useEffect, useMemo, useState } from "react";
import { NICHES as NICHES_LOCAL, scoreColor, type Niche } from "../data";
import { usePrefersReducedMotion } from "../hooks";

const SWEEP_PERIOD = 5200;

export function RadarScope({
  niches,
  selected,
  onSelect,
}: {
  niches: Niche[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [sweepDeg, setSweepDeg] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      setSweepDeg(((t - t0) / SWEEP_PERIOD) * 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const points = useMemo(() => {
    const sorted = [...niches].sort((a, b) => b.monthly - a.monthly);
    const maxRev = Math.max(...sorted.map((n) => n.monthly));
    const minRev = Math.min(...sorted.map((n) => n.monthly));
    return sorted.map((n) => {
      const idx = sorted.indexOf(n);
      const angle = idx * 137.5 + 20;
      const radius = 120 - ((n.score - 40) / 50) * 96;
      const rad = (angle * Math.PI) / 180;
      const x = 280 + Math.cos(rad) * radius;
      const y = 280 + Math.sin(rad) * radius;
      const size = 4 + ((n.monthly - minRev) / (maxRev - minRev || 1)) * 5;
      return { n, x, y, size, color: scoreColor(n.score) };
    });
  }, [niches]);

  return (
    <svg viewBox="0 0 560 560" className="w-full">
      <defs>
        <radialGradient id="scopeGlow" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#12324a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#081624" />
        </radialGradient>
        <radialGradient id="blipGlow">
          <stop offset="0%" stopColor="#3ce6a4" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#3ce6a4" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="280" cy="280" r="272" fill="url(#scopeGlow)" stroke="#1c3a54" strokeWidth="2" />
      <circle cx="280" cy="280" r="270" fill="none" stroke="#3ce6a4" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="2 6" className="spin-slow" style={{ transformOrigin: "280px 280px" }} />
      {[70, 120, 170, 220].map((r) => (
        <circle key={r} cx="280" cy="280" r={r} fill="none" stroke="#1c3a54" strokeWidth="1" />
      ))}
      <line x1="280" y1="10" x2="280" y2="550" stroke="#1c3a54" strokeOpacity="0.6" />
      <line x1="10" y1="280" x2="550" y2="280" stroke="#1c3a54" strokeOpacity="0.6" />

      {/* sweep */}
      {!reduced && (
        <g transform={`rotate(${sweepDeg} 280 280)`}>
          <path d="M280 280 L280 8 A272 272 0 0 1 416 44 Z" fill="#3ce6a4" opacity="0.1" />
          <path d="M280 280 L280 8 A272 272 0 0 1 349 17 Z" fill="#3ce6a4" opacity="0.16" />
          <line x1="280" y1="280" x2="280" y2="8" stroke="#3ce6a4" strokeWidth="1.6" opacity="0.8" />
        </g>
      )}

      {/* score labels */}
      {[
        [70, "40"],
        [120, "55"],
        [170, "70"],
        [220, "85+"],
      ].map(([r, l]) => (
        <text key={String(l)} x={286} y={280 - (r as number) + 14} fontSize="10" fill="#5d7b90" className="tabular">
          {l}
        </text>
      ))}

      {/* blips */}
      {points.map(({ n, x, y, size, color }) => {
        const isSel = selected === n.id;
        const d = Math.hypot(x - 280, y - 280);
        let angle = (Math.atan2(y - 280, x - 280) * 180) / Math.PI;
        if (angle < 0) angle += 360;
        const delta = (angle - (sweepDeg % 360) + 360) % 360;
        const glow = !reduced && delta < 40 ? (1 - delta / 40) * 0.85 : 0;
        return (
          <g
            key={n.id}
            transform={`translate(${x} ${y})`}
            onClick={() => onSelect(n.id)}
            className="cursor-pointer"
            opacity={selected && !isSel ? 0.45 : 1}
            style={{ transition: "opacity .25s ease" }}
          >
            {glow > 0.05 && <circle r={size + 12} fill="url(#blipGlow)" opacity={glow} />}
            {isSel && <circle r={size + 9} fill="none" stroke={color} strokeOpacity="0.9" strokeWidth="1.5" strokeDasharray="3 4" className="spin-slow" style={{ transformOrigin: "0 0" }} />}
            {n.delta >= 9 && <circle r={size + 5} fill="none" stroke={color} className="pulse-ring" />}
            <circle
              r={isSel ? size + 2.5 : size}
              fill={color}
              fillOpacity={isSel ? 1 : 0.85}
              stroke="#06121c"
              strokeWidth="1.5"
              style={{ transition: "r .2s ease", filter: `drop-shadow(0 0 ${4 + glow * 10}px ${color})` }}
            >
              <title>{`${n.title} — балл ${n.score}`}</title>
            </circle>
            {isSel && (
              <text y={-size - 9} textAnchor="middle" fontSize="11" fontWeight="600" fill="#e9f4f8" style={{ fontFamily: "var(--font-body)" }}>
                {n.title}
              </text>
            )}
          </g>
        );
      })}

      <circle cx="280" cy="280" r="5" fill="#3ce6a4" className="breathe" />
      <text x="280" y="546" textAnchor="middle" fontSize="10" fill="#5d7b90" letterSpacing="2">
        БАЛЛ НИШИ: 40 — ЦЕНТР · 85+ — КРАЙ
      </text>
    </svg>
  );
}

/* ---------- живой журнал движка ---------- */
const LOG_TEMPLATES = [
  (n: Niche) => `[overpass] «${n.title}»: ${n.competitors.length} точек конкурентов`,
  (n: Niche) => `[scout] скоринг «${n.title}»: ${n.score}/100 (Δ ${n.delta > 0 ? "+" : ""}${n.delta} за квартал)`,
  () => "[snapshot] MarketSnapshot: кэш актуален (TTL 7 дней)",
  (n: Niche) => `[matcher] спрос «${n.title}»: ${Math.max(...n.demand)} у.е. в пике сезона`,
  () => "[rllm] RussianLLMService: GigaChat подключён · без ключа → заглушка",
  (n: Niche) => `[finance] медианная окупаемость «${n.title}»: ${Math.round(n.startup / (n.monthly * (n.margin / 100) * 0.55))} мес`,
  () => "[regions] демография: Росстат API в очереди (статичный справочник активен)",
];

export function ScanLog() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    let idx = 0;
    const push = () => {
      if (cancelled) return;
      const n = NICHES_LOCAL[idx % NICHES_LOCAL.length];
      const msg = LOG_TEMPLATES[idx % LOG_TEMPLATES.length](n);
      const time = new Date().toLocaleTimeString("ru-RU", { hour12: false });
      setLines((prev) => [`${time}  ${msg}`, ...prev].slice(0, 6));
      idx++;
    };
    push();
    const id = window.setInterval(push, 1900);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-lg border border-linesoft bg-bg0/70 px-3.5 py-3 font-mono text-[11px] leading-relaxed">
      {lines.map((l, i) => (
        <div key={l + i} className={i === 0 ? "anim-rise text-sig" : "text-mut/80"} style={{ opacity: 1 - i * 0.13 }}>
          {l}
        </div>
      ))}
      {lines.length === 0 && <div className="text-dim">инициализация движка…</div>}
    </div>
  );
}

