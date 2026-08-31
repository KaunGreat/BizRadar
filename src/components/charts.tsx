import { useId, useRef, useState } from "react";
import { useMounted } from "../hooks";

/* ---------- Score ring ---------- */
export function ScoreRing({
  value,
  size = 108,
  stroke = 8,
  color,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  sub?: string;
}) {
  const mounted = useMounted();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = mounted ? c * (1 - value / 100) : c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1c3a54" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.7,.3,1)", filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-display font-bold tabular" style={{ fontSize: size * 0.26, color }}>
          {Math.round(value)}
        </div>
        {sub && <div className="mt-1 text-[10px] uppercase tracking-wider text-mut">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------- Sparkline ---------- */
export function Spark({ data, color, w = 92, h = 30 }: { data: number[]; color: string; w?: number; h?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((v - min) / (max - min || 1)) * (h - 6)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" opacity={0.9} />
      <circle cx={w} cy={h - 3 - ((data[data.length - 1] - min) / (max - min || 1)) * (h - 6)} r={2.4} fill={color} />
    </svg>
  );
}

/* ---------- Area chart (12 мес) ---------- */
export function AreaChart({
  data,
  color,
  labels,
  format,
}: {
  data: number[];
  color: string;
  labels: string[];
  format: (v: number) => string;
}) {
  const gid = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 560;
  const H = 220;
  const padL = 46;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const max = Math.max(...data) * 1.08;
  const min = Math.min(...data) * 0.85;
  const x = (i: number) => padL + (i / (data.length - 1)) * iw;
  const y = (v: number) => padT + ih - ((v - min) / (max - min || 1)) * ih;

  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)} ${H - padB} L${x(0)} ${H - padB} Z`;

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((rx - padL) / iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  };

  const gridYs = [0.25, 0.5, 0.75, 1].map((t) => padT + ih * (1 - t));

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`ag${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridYs.map((gy, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="#14293c" strokeDasharray="3 5" />
            <text x={padL - 8} y={gy + 3.5} textAnchor="end" fontSize="10" fill="#5d7b90" className="tabular">
              {format(min + (max - min) * [0.25, 0.5, 0.75, 1][i])}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#ag${gid})`} className="anim-fade" />
        <path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" pathLength={1} className="draw-line" />
        {labels.map((l, i) =>
          i % 2 === 0 ? (
            <text key={l} x={x(i)} y={H - 9} textAnchor="middle" fontSize="10" fill="#5d7b90">
              {l}
            </text>
          ) : null
        )}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke={color} strokeOpacity={0.35} />
            <circle cx={x(hover)} cy={y(data[hover])} r={5} fill="#06121c" stroke={color} strokeWidth={2.4} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-1 rounded-md border border-line bg-bg2/95 px-2.5 py-1.5 text-xs shadow-xl"
          style={{
            left: `${((padL + (hover / (data.length - 1)) * iw) / W) * 100}%`,
            transform: hover > data.length / 2 ? "translateX(-110%)" : "translateX(12px)",
          }}
        >
          <div className="text-mut">{labels[hover]}</div>
          <div className="font-semibold tabular" style={{ color }}>
            {format(data[hover])}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Pentagon radar (под-баллы) ---------- */
export function PentagonRadar({
  values,
  color,
  size = 220,
}: {
  values: { label: string; value: number }[];
  color: string;
  size?: number;
}) {
  const mounted = useMounted();
  const c = size / 2;
  const R = size / 2 - 34;
  const pt = (i: number, r: number) => {
    const a = (-90 + (360 / values.length) * i) * (Math.PI / 180);
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const ring = (t: number) => values.map((_, i) => pt(i, R * t).join(",")).join(" ");
  const poly = values.map((v, i) => pt(i, (R * Math.max(6, v.value)) / 100).join(",")).join(" ");

  return (
    <svg width={size} height={size} className="overflow-visible">
      {[0.33, 0.66, 1].map((t) => (
        <polygon key={t} points={ring(t)} fill="none" stroke="#1c3a54" strokeWidth={t === 1 ? 1.4 : 1} />
      ))}
      {values.map((_, i) => {
        const [px, py] = pt(i, R);
        return <line key={i} x1={c} y1={c} x2={px} y2={py} stroke="#14293c" />;
      })}
      <polygon
        points={poly}
        fill={color}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        style={{
          transformOrigin: `${c}px ${c}px`,
          transform: mounted ? "scale(1)" : "scale(0.5)",
          opacity: mounted ? 1 : 0,
          transition: "transform .8s cubic-bezier(.2,.7,.3,1), opacity .6s ease",
        }}
      />
      {values.map((v, i) => {
        const [px, py] = pt(i, (R * Math.max(6, v.value)) / 100);
        return <circle key={i} cx={px} cy={py} r={3} fill={color} className={mounted ? "anim-fade" : ""} />;
      })}
      {values.map((v, i) => {
        const [px, py] = pt(i, R + 20);
        return (
          <text key={v.label} x={px} y={py + 3} textAnchor="middle" fontSize="10.5" fill="#8facc0" fontWeight={500}>
            {v.label}
          </text>
        );
      })}
    </svg>
  );
}

/* ---------- Bars (денежный поток) ---------- */
export function BarsChart({
  data,
  format,
  labelsEvery = 4,
  labelPrefix = "мес ",
}: {
  data: number[];
  format: (v: number) => string;
  labelsEvery?: number;
  labelPrefix?: string;
}) {
  const W = 560;
  const H = 190;
  const padL = 10;
  const padB = 24;
  const max = Math.max(...data, 0) * 1.1;
  const min = Math.min(...data, 0) * 1.1;
  const zeroY = (H - padB) - ((0 - min) / (max - min || 1)) * (H - padB - 14);
  const bw = (W - padL * 2) / data.length;
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseLeave={() => setHover(null)}>
        <line x1={padL} x2={W - padL} y1={zeroY} y2={zeroY} stroke="#2a5378" strokeWidth={1.4} />
        {data.map((v, i) => {
          const yv = (H - padB) - ((v - min) / (max - min || 1)) * (H - padB - 14);
          const top = Math.min(yv, zeroY);
          const hgt = Math.max(2, Math.abs(yv - zeroY));
          const pos = v >= 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect
                x={padL + i * bw + 1.5}
                y={top}
                width={bw - 3}
                height={hgt}
                rx={2.5}
                fill={pos ? "#3ce6a4" : "#ff6d6d"}
                opacity={hover === null || hover === i ? (pos ? 0.85 : 0.8) : 0.35}
                className="bar-grow"
                style={{ animationDelay: `${i * 24}ms` }}
              />
              {(i + 1) % labelsEvery === 0 && (
                <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#5d7b90">
                  {labelPrefix}
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
        <text x={W - padL} y={zeroY - 6} textAnchor="end" fontSize="10" fill="#5d7b90">
          0 — точка окупаемости вложений
        </text>
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-bg2/95 px-2.5 py-1.5 text-xs shadow-xl"
          style={{
            left: `${((padL + hover * ((W - padL * 2) / data.length)) / W) * 100}%`,
            transform: hover > data.length / 2 ? "translateX(-110%)" : "translateX(14px)",
          }}
        >
          <div className="text-mut">Месяц {hover + 1}</div>
          <div className="font-semibold tabular" style={{ color: data[hover] >= 0 ? "#3ce6a4" : "#ff6d6d" }}>
            {format(data[hover])}
          </div>
        </div>
      )}
    </div>
  );
}
