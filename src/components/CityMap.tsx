import { useMemo, useRef, useState, type CSSProperties } from "react";
import { DISTRICTS, type Niche } from "../data";
import { ITarget, IPin } from "./icons";

const W = 800;
const H = 560;
const M_PER_PX = 15;

const DISTRICT_SHAPES: { name: string; d: string }[] = [
  { name: "Центр", d: "M300 215 L505 205 L525 365 L312 385 Z" },
  { name: "Северный", d: "M185 58 L425 40 L455 158 L222 188 Z" },
  { name: "Академический", d: "M522 78 L742 98 L722 218 L542 198 Z" },
  { name: "Восточный", d: "M562 258 L762 278 L742 442 L560 420 Z" },
  { name: "Южный", d: "M198 428 L425 428 L432 520 L188 520 Z" },
  { name: "Заречный", d: "M58 218 L232 228 L222 382 L68 360 Z" },
];

export function CityMap({ niche, cityK, cityName }: { niche: Niche; cityK: number; cityName: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [radius, setRadius] = useState(120);
  const [hoverId, setHoverId] = useState<number | null>(null);

  const onClick = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    setPoint({ x: Math.max(16, Math.min(W - 16, x)), y: Math.max(16, Math.min(H - 16, y)) });
  };

  const inRadius = useMemo(() => {
    if (!point) return [];
    return niche.competitors.filter((c) => Math.hypot(c.x - point.x, c.y - point.y) <= radius);
  }, [point, radius, niche]);

  const district = useMemo(() => {
    if (!point) return null;
    let best = DISTRICTS[0];
    let bd = Infinity;
    for (const d of DISTRICTS) {
      const dist = Math.hypot(d.x - point.x, d.y - point.y);
      if (dist < bd) {
        bd = dist;
        best = d;
      }
    }
    return best.name;
  }, [point]);

  const heat = useMemo(() => {
    return DISTRICTS.map((d) => {
      const count = niche.competitors.filter((c) => {
        let best = DISTRICTS[0];
        let bd = Infinity;
        for (const dd of DISTRICTS) {
          const dist = Math.hypot(dd.x - c.x, dd.y - c.y);
          if (dist < bd) {
            bd = dist;
            best = dd;
          }
        }
        return best.name === d.name;
      }).length;
      return { ...d, count };
    });
  }, [niche]);

  const verdict = !point
    ? "Кликните по карте — поставьте точку «моего магазина», чтобы оценить плотность конкурентов вокруг."
    : inRadius.length <= 2
    ? "Низкая плотность: окно возможностей. Проверьте пешеходный трафик — пустая зона может означать и отсутствие спроса."
    : inRadius.length <= 5
    ? "Умеренная конкуренция: вход возможен при чётком позиционировании и дифференциации (сервис, часы работы, продукт)."
    : "Высокая плотность: рынок поделён. Нужна аренда заметно дешевле конкурентов или уникальное предложение.";

  const radiusM = radius * M_PER_PX;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_290px]">
      <div>
        <div className="panel overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[11px] text-mut">
            <span className="inline-flex items-center gap-2">
              <IPin size={14} className="text-sig" />
              {cityName} · слой конкурентов «{niche.title}»
            </span>
            <span className="rounded border border-line bg-bg2 px-2 py-0.5 font-mono text-[10px] text-cy">
              OSM Overpass API · снимок рынка
            </span>
          </div>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto cursor-crosshair block" onClick={onClick}>
            <defs>
              <radialGradient id="heat">
                <stop offset="0%" stopColor="#ffc24b" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ffc24b" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="mapBg" cx="45%" cy="40%">
                <stop offset="0%" stopColor="#0d2133" />
                <stop offset="100%" stopColor="#081624" />
              </radialGradient>
            </defs>

            <rect width={W} height={H} fill="url(#mapBg)" />

            {/* street grid */}
            {[90, 160, 230, 300, 370, 440, 510].map((y, i) => (
              <line key={`h${y}`} x1={24} y1={y + (i % 2) * 6} x2={776} y2={y - (i % 3) * 8} stroke="#4cc9f0" strokeOpacity={0.06} strokeWidth={2} />
            ))}
            {[110, 200, 290, 380, 470, 560, 650, 740].map((x, i) => (
              <line key={`v${x}`} x1={x + (i % 2) * 8} y1={36} x2={x - (i % 3) * 6} y2={536} stroke="#4cc9f0" strokeOpacity={0.06} strokeWidth={2} />
            ))}
            <line x1={50} y1={530} x2={750} y2={110} stroke="#4cc9f0" strokeOpacity={0.12} strokeWidth={3.5} />
            <line x1={110} y1={50} x2={710} y2={510} stroke="#4cc9f0" strokeOpacity={0.1} strokeWidth={3} />

            {/* river */}
            <path d="M-20 392 C 170 350, 250 430, 430 405 C 610 380, 660 300, 820 335" fill="none" stroke="#123a52" strokeWidth={30} strokeLinecap="round" />
            <path d="M-20 392 C 170 350, 250 430, 430 405 C 610 380, 660 300, 820 335" fill="none" stroke="#4cc9f0" strokeOpacity={0.1} strokeWidth={20} strokeLinecap="round" />

            {/* districts */}
            {DISTRICT_SHAPES.map((s) => (
              <g key={s.name}>
                <path d={s.d} fill="#163049" fillOpacity={0.28} stroke="#2a5378" strokeOpacity={0.5} strokeDasharray="5 6" />
                <text
                  x={DISTRICTS.find((d) => d.name === s.name)!.x}
                  y={DISTRICTS.find((d) => d.name === s.name)!.y - 34}
                  textAnchor="middle"
                  fontSize="11"
                  letterSpacing="2.5"
                  fill="#8facc0"
                  opacity={0.55}
                  style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}
                >
                  {s.name}
                </text>
              </g>
            ))}

            {/* heat of competition */}
            {heat.map((d) =>
              d.count > 0 ? (
                <circle key={`heat-${d.name}`} cx={d.x} cy={d.y} r={30 + d.count * 9 * Math.min(cityK, 2)} fill="url(#heat)" className="anim-fade" />
              ) : null
            )}

            {/* radius + user point */}
            {point && (
              <g>
                <circle cx={point.x} cy={point.y} r={radius} fill="#3ce6a4" fillOpacity={0.05} stroke="#3ce6a4" strokeOpacity={0.7} strokeDasharray="7 7" strokeWidth={1.6} />
                <line x1={point.x - 14} y1={point.y} x2={point.x + 14} y2={point.y} stroke="#3ce6a4" strokeWidth={1.4} />
                <line x1={point.x} y1={point.y - 14} x2={point.x} y2={point.y + 14} stroke="#3ce6a4" strokeWidth={1.4} />
                <circle cx={point.x} cy={point.y} r={5.5} fill="#3ce6a4" stroke="#06121c" strokeWidth={2} />
                <text x={point.x} y={point.y - radius - 10} textAnchor="middle" fontSize="11" fill="#3ce6a4" fontWeight={600} className="tabular">
                  {radiusM >= 1000 ? `${(radiusM / 1000).toFixed(1).replace(".", ",")} км` : `${radiusM} м`}
                </text>
              </g>
            )}

            {/* competitors */}
            {niche.competitors.map((c) => {
              const inside = point ? Math.hypot(c.x - point.x, c.y - point.y) <= radius : false;
              const dim = point && !inside;
              return (
                <g
                  key={c.id}
                  transform={`translate(${c.x} ${c.y})`}
                  opacity={dim ? 0.28 : 1}
                  style={{ transition: "opacity .3s ease" }}
                  onMouseEnter={() => setHoverId(c.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <circle r={9} fill="none" stroke="#ffc24b" strokeOpacity={0.5} className="pulse-ring" style={{ animationDelay: `${(c.id % 6) * 0.4}s` }} />
                  <circle r={hoverId === c.id ? 7 : 5.5} fill={inside ? "#3ce6a4" : "#ffc24b"} stroke="#06121c" strokeWidth={2} style={{ transition: "r .15s ease" }} />
                  {hoverId === c.id && (
                    <g transform={`translate(${c.x > W - 200 ? -176 : 12} -34)`} className="anim-fade">
                      <rect width={164} height={30} rx={6} fill="#0f2334" stroke="#2a5378" />
                      <text x={9} y={19} fontSize="11" fill="#e9f4f8" fontWeight={600}>
                        {c.name.length > 20 ? c.name.slice(0, 19) + "…" : c.name}
                      </text>
                      <text x={155} y={19} textAnchor="end" fontSize="11" fill="#ffc24b" className="tabular">
                        ★ {c.rating.toFixed(1)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            <text x={W - 14} y={H - 12} textAnchor="end" fontSize="10" fill="#5d7b90">
              стилизованная схема · масштаб ≈ 15 м/пикс
            </text>
          </svg>
        </div>

        {/* radius control */}
        <div className="mt-4 flex flex-wrap items-center gap-4 panel-soft rounded-lg px-4 py-3">
          <span className="inline-flex items-center gap-2 text-xs text-mut">
            <ITarget size={15} className="text-sig" />
            Радиус анализа
          </span>
          <input
            type="range"
            min={40}
            max={240}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="min-w-40 flex-1"
            style={{ "--fill": `${((radius - 40) / 200) * 100}%` } as CSSProperties}
          />
          <span className="w-20 text-right font-display text-sm text-sig tabular">
            {radiusM >= 1000 ? `${(radiusM / 1000).toFixed(1).replace(".", ",")} км` : `${radiusM} м`}
          </span>
          <button
            onClick={() => setPoint(null)}
            disabled={!point}
            className="rounded-md border border-line px-3 py-1.5 text-xs text-mut transition hover:border-cor/60 hover:text-cor disabled:opacity-30 disabled:hover:border-line disabled:hover:text-mut"
          >
            Сбросить точку
          </button>
        </div>
      </div>

      {/* side stats */}
      <div className="flex flex-col gap-3">
        <div className="panel rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-dim">Конкурентов в радиусе</div>
          <div
            className="mt-1 font-display text-4xl font-bold tabular"
            style={{ color: point ? (inRadius.length <= 2 ? "#3ce6a4" : inRadius.length <= 5 ? "#ffc24b" : "#ff6d6d") : "#5d7b90" }}
          >
            {point ? inRadius.length : "—"}
          </div>
          <div className="mt-1 text-xs text-mut">
            всего в городе: <span className="text-ink tabular">{niche.competitors.length}</span> · по нише «{niche.title}»
          </div>
        </div>
        <div className="panel-soft rounded-xl p-4 text-sm">
          <div className="text-[10px] uppercase tracking-[0.18em] text-dim">Район точки</div>
          <div className="mt-1 font-semibold">{district ?? "не выбрана"}</div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-dim">Вывод движка</div>
          <p className="mt-1 text-[13px] leading-relaxed text-mut">{verdict}</p>
        </div>
        <div className="panel-soft rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-dim mb-2.5">Легенда слоя</div>
          {[
            ["#ffc24b", "конкурент (точка OSM)"],
            ["#3ce6a4", "ваша точка / внутри радиуса"],
            ["#ffc24b", "тепловая зона плотности"],
          ].map(([c, l], i) => (
            <div key={i} className="flex items-center gap-2.5 py-1 text-xs text-mut">
              <span
                className={i === 2 ? "h-3 w-3 rounded-full opacity-60" : "h-2.5 w-2.5 rounded-full"}
                style={{ background: c, boxShadow: i !== 2 ? `0 0 8px ${c}` : undefined, filter: i === 2 ? "blur(2px)" : undefined }}
              />
              {l}
            </div>
          ))}
          <p className="mt-3 border-t border-linesoft pt-3 text-[11px] leading-relaxed text-dim">
            Данные — снимок Overpass API (кэш 7 дней). Точность адресов ±30 м; для сделки проверяйте выездом.
          </p>
        </div>
      </div>
    </div>
  );
}
