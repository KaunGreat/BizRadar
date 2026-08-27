import { useEffect, useRef, useState } from "react";
import {
  SIGNAL_META,
  geocodeCity,
  heatColor,
  zonesExtent,
  type LocationCell,
  type MapMode,
  type MatcherCity,
} from "../matcher";
import { MAPS_KEY, loadYmaps } from "../ymaps";

/* ---------- вспомогательное ---------- */
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function hslToHex(hsl: string): string {
  if (hsl.startsWith("#")) return hsl;
  const m = hsl.match(/hsl\((\d+)/);
  if (!m) return "#3ce6a4";
  const h = Number(m[1]) / 360;
  const s = 0.74;
  const l = 0.52;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/* ---------- контент попапа (баллун Яндекса) ---------- */
function balloonHtml(c: LocationCell): string {
  const color = hslToHex(heatColor(c.score));
  const chips = SIGNAL_META.map(
    (s) =>
      `<span style="display:inline-flex;align-items:center;margin:2px 3px 0 0;padding:2px 8px;border-radius:6px;background:${hexA(hslToHex(s.color), 0.1)};border:1px solid ${hexA(hslToHex(s.color), 0.28)};color:${hslToHex(s.color)};font-size:10.5px;line-height:1.5">${s.label.split(" ")[0]} · ${c.signals[s.key]}</span>`
  ).join("");
  return `<div style="width:238px;padding:2px 2px 4px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="font-family:Unbounded,'Golos Text',sans-serif;font-size:13px;font-weight:700;color:#e9f4f8">${c.district ?? c.id}</div>
      <div style="font-family:Unbounded,'Golos Text',sans-serif;font-size:18px;font-weight:800;color:${color}">${c.score.toFixed(0)}</div>
    </div>
    <div style="margin:7px 0 3px;height:4px;border-radius:4px;background:#163049;overflow:hidden">
      <div style="height:100%;width:${c.score}%;background:${color}"></div>
    </div>
    <div style="font-size:11px;color:#8facc0;margin-top:7px">
      конкурентов в ячейке: <b style="color:${c.competitors === 0 ? "#3ce6a4" : c.competitors <= 3 ? "#ffc24b" : "#ff6d6d"}">${c.competitors}</b>
      <span style="opacity:.7"> · ${c.id}</span>
    </div>
    <div style="margin-top:6px">${chips}</div>
    ${c.reason ? `<div style="margin-top:9px;padding-top:8px;border-top:1px solid #14293c;font-size:11px;line-height:1.5;color:#8facc0">${c.reason}</div>` : ""}
  </div>`;
}

/* ---------- провайдер: Yandex Maps 2.1 ---------- */
function buildBalloonLayout(ym: any) {
  const layout = ym.templateLayoutFactory.createClass(
    `<div class="br-balloon">
       <button class="br-balloon__close" type="button" aria-label="Закрыть">×</button>
       <div>$[properties.balloonBodyContent]</div>
     </div>`,
    {
      build(this: any) {
        layout.superclass.build.call(this);
        const el = this.getParentElement().querySelector(".br-balloon__close");
        this._onClose = () => this.getData().map.balloon.close();
        if (el) el.addEventListener("click", this._onClose);
      },
      clear(this: any) {
        const el = this.getParentElement().querySelector(".br-balloon__close");
        if (el) el.removeEventListener("click", this._onClose);
        layout.superclass.clear.call(this);
      },
    }
  );
  return layout;
}

function badgeLayout(ym: any, n: number, first: boolean) {
  return ym.templateLayoutFactory.createClass(
    `<div class="br-badge${first ? " br-badge--first" : ""}">${n}</div>`
  );
}

export function MatcherMap({
  cells,
  top,
  selected,
  onSelect,
  city,
  onModeChange,
}: {
  cells: LocationCell[];
  top: LocationCell[];
  selected: LocationCell | null;
  onSelect: (c: LocationCell) => void;
  city: MatcherCity;
  onModeChange: (m: MapMode) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const ymRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const collRef = useRef<any>(null);
  const badgesRef = useRef<any>(null);
  const balloonLayoutRef = useRef<any>(null);
  const badgeCache = useRef<Map<string, any>>(new Map());
  const onSelectRef = useRef(onSelect);
  const [mode, setMode] = useState<MapMode>("provider");
  onSelectRef.current = onSelect;

  /* ---------- инициализация провайдера ---------- */
  useEffect(() => {
    if (!MAPS_KEY) {
      setMode("no-key");
      onModeChange("no-key");
      return;
    }
    let cancelled = false;
    loadYmaps()
      .then((ym) => {
        if (cancelled || !divRef.current) return;
        ymRef.current = ym;
        // Порядок координат Яндекса: [lat, lon] — как в данных бэкенда.
        const map = new ym.Map(
          divRef.current,
          { center: city.center, zoom: 12, type: "yandex#map", controls: [] },
          { suppressMapOpenBlock: true }
        );
        collRef.current = new ym.GeoObjectCollection();
        badgesRef.current = new ym.GeoObjectCollection();
        map.geoObjects.add(collRef.current);
        map.geoObjects.add(badgesRef.current);
        mapRef.current = map;
        balloonLayoutRef.current = buildBalloonLayout(ym);
        setMode("ymaps");
        onModeChange("ymaps");
      })
      .catch(() => {
        if (cancelled) return;
        setMode("fallback");
        onModeChange("fallback");
      });
    return () => {
      cancelled = true;
      try {
        mapRef.current?.destroy();
      } catch {
        /* noop */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- геокодер: город без центра в словаре ---------- */
  useEffect(() => {
    if (mode !== "ymaps") return;
    const map = mapRef.current;
    const ym = ymRef.current;
    if (!map || !ym || city.center) return;
    geocodeCity(ym, city.name)
      .then(({ center, bounds }) => {
        if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
        else map.setCenter(center, 12);
      })
      .catch(() => map.setCenter(city.bbox.slice(0, 2), 12));
  }, [mode, city.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- зоны + бейджи + fitBounds ---------- */
  useEffect(() => {
    const ym = ymRef.current;
    const map = mapRef.current;
    const coll = collRef.current;
    const badges = badgesRef.current;
    if (mode !== "ymaps" || !ym || !map || !coll || !badges) return;

    coll.removeAll();
    badges.removeAll();

    cells.forEach((c) => {
      const color = hslToHex(heatColor(c.score));
      const isSel = selected?.id === c.id;
      // Яндекс: Circle([[lat, lon], радиус в метрах]) — ВАЖНО: [lat, lon]!
      const circle = new ym.Circle(
        [[c.lat, c.lon], 235],
        {},
        {
          fillColor: hexA(color, isSel ? 0.5 : 0.28),
          strokeColor: color,
          strokeOpacity: isSel ? 1 : 0.85,
          strokeWidth: isSel ? 3 : 1.4,
        }
      );
      circle.events.add("click", () => {
        onSelectRef.current(c);
        map.balloon.open(
          [c.lat, c.lon],
          { balloonBodyContent: balloonHtml(c) },
          { balloonLayout: balloonLayoutRef.current, balloonAutoPan: true, balloonPanelMaxMapArea: 0 }
        );
      });
      coll.add(circle);
    });

    top.forEach((t, i) => {
      const key = `${i}-${i === 0}`;
      if (!badgeCache.current.has(key)) badgeCache.current.set(key, badgeLayout(ym, i + 1, i === 0));
      const pm = new ym.Placemark(
        [t.lat, t.lon],
        {},
        {
          iconLayout: badgeCache.current.get(key),
          iconShape: { type: "Circle", coordinates: [0, 0], radius: 13 },
          zIndex: 20 - i,
          hideIconOnBalloonOpen: false,
        }
      );
      badges.add(pm);
    });

    // Центр + масштаб: видны ВСЕ зоны города (bbox ∪ ячейки).
    map.setBounds(zonesExtent(cells, city), { checkZoomRange: true, zoomMargin: 44, duration: 380 });
  }, [mode, cells, top, selected?.id, city.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- офлайн-схема (нет ключа / провайдер недоступен) ---------- */
  const W = 800;
  const H = 520;
  const proj = (() => {
    const [s, w, n, e] = city.bbox;
    const cosM = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const bw = (e - w) * cosM;
    const bh = n - s;
    const sc = Math.min((W - 56) / bw, (H - 56) / bh);
    const ox = (W - bw * sc) / 2;
    const oy = (H - bh * sc) / 2;
    return {
      sc,
      px: (lat: number, lon: number): [number, number] => [ox + (lon - w) * cosM * sc, oy + (n - lat) * sc],
    };
  })();
  const cellPx = (235 / 111320) * proj.sc;

  const zoom = (d: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoom(map.getZoom() + d, { duration: 200 });
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-bg1">
      <div ref={divRef} className={`h-[560px] w-full ${mode === "ymaps" ? "" : "hidden"}`} />

      {/* офлайн-схема */}
      {mode !== "ymaps" && (
        <div className="relative h-[560px] w-full anim-fade">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full cursor-crosshair">
            <defs>
              <radialGradient id="mmapBg" cx="45%" cy="40%">
                <stop offset="0%" stopColor="#0d2133" />
                <stop offset="100%" stopColor="#081624" />
              </radialGradient>
            </defs>
            <rect width={W} height={H} fill="url(#mmapBg)" />
            {Array.from({ length: 19 }, (_, i) => (
              <line key={`v${i}`} x1={40 + i * 40} y1={20} x2={40 + i * 40} y2={H - 20} stroke="#4cc9f0" strokeOpacity={0.05} />
            ))}
            {Array.from({ length: 12 }, (_, i) => (
              <line key={`h${i}`} x1={24} y1={40 + i * 40} x2={W - 24} y2={40 + i * 40} stroke="#4cc9f0" strokeOpacity={0.05} />
            ))}
            <line x1={60} y1={H - 40} x2={W - 60} y2={60} stroke="#4cc9f0" strokeOpacity={0.1} strokeWidth={3} />
            <line x1={90} y1={60} x2={W - 90} y2={H - 60} stroke="#4cc9f0" strokeOpacity={0.08} strokeWidth={2.5} />

            {cells.map((c, i) => {
              const [x, y] = proj.px(c.lat, c.lon);
              const color = heatColor(c.score);
              const isSel = selected?.id === c.id;
              return (
                <g key={c.id} transform={`translate(${x} ${y})`} onClick={() => onSelect(c)} className="cursor-pointer">
                  <title>{`score ${c.score.toFixed(0)} · конкурентов: ${c.competitors}`}</title>
                  <circle r={cellPx} fill={color} fillOpacity={isSel ? 0.5 : 0.24} stroke={isSel ? "#e9f4f8" : color} strokeOpacity={isSel ? 1 : 0.8} strokeWidth={isSel ? 2.4 : 1.2} className="anim-fade" style={{ animationDelay: `${Math.min(i * 4, 500)}ms` }} />
                </g>
              );
            })}
            {top.map((t, i) => {
              const [x, y] = proj.px(t.lat, t.lon);
              return (
                <g key={`b${t.id}`} transform={`translate(${x} ${y})`} className="pointer-events-none">
                  <circle r={11} fill="#06121c" stroke={i === 0 ? "#3ce6a4" : "#e9f4f8"} strokeWidth={1.6} style={{ filter: i === 0 ? "drop-shadow(0 0 8px rgba(60,230,164,.7))" : undefined }} />
                  <text y={3.6} textAnchor="middle" fontSize="10.5" fontWeight={700} fill={i === 0 ? "#3ce6a4" : "#e9f4f8"} style={{ fontFamily: "var(--font-display)" }}>
                    {i + 1}
                  </text>
                </g>
              );
            })}
            <text x={W - 16} y={H - 12} textAnchor="end" fontSize="10" fill="#5d7b90">
              офлайн-схема · {city.name} · ячейки 500 м
            </text>
          </svg>

          <div className="absolute left-3 top-3 max-w-sm rounded-lg border border-vio/35 bg-bg1/92 px-3.5 py-3 backdrop-blur">
            <div className="font-display text-[12px] font-bold text-vio">
              {mode === "no-key" ? "Офлайн-схема: ключ Яндекс.Карт не задан" : "Офлайн-схема: провайдер недоступен"}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-mut">
              {mode === "no-key" ? (
                <>Зоны кликабельны и работают без провайдера. Для живых тайлов положите ключ в <code className="rounded bg-bg2 px-1 font-mono text-[10px] text-cy">.env</code>: <code className="rounded bg-bg2 px-1 font-mono text-[10px] text-sig">VITE_YANDEX_MAPS_KEY=…</code></>
              ) : (
                <>SDK Яндекс.Карт не загрузился из сети — функциональность сохранена на локальной схеме.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* кастомный зум (тёмный, под дашборд) */}
      {mode === "ymaps" && (
        <div className="absolute bottom-4 right-3 z-[500] flex flex-col overflow-hidden rounded-lg border border-line shadow-[0_10px_28px_rgba(0,0,0,.5)]">
          <button onClick={() => zoom(1)} className="flex h-9 w-9 items-center justify-center bg-bg2/95 font-display text-lg text-mut backdrop-blur transition hover:bg-bg3 hover:text-sig" aria-label="Приблизить">+</button>
          <button onClick={() => zoom(-1)} className="flex h-9 w-9 items-center justify-center border-t border-line bg-bg2/95 font-display text-lg text-mut backdrop-blur transition hover:bg-bg3 hover:text-sig" aria-label="Отдалить">−</button>
        </div>
      )}

      {/* легенда */}
      <div className="pointer-events-none absolute bottom-4 left-3 z-[500] w-52 rounded-lg border border-line bg-bg1/85 p-3 backdrop-blur">
        <div className="mb-1.5 text-[9.5px] uppercase tracking-[0.16em] text-dim">Привлекательность ячейки</div>
        <div className="h-2 rounded-full" style={{ background: "linear-gradient(90deg, hsl(16 74% 52%), hsl(48 74% 52%), hsl(78 74% 52%), hsl(140 74% 52%))" }} />
        <div className="mt-1 flex justify-between text-[9.5px] text-mut">
          <span>0 · насыщено</span>
          <span>100 · окно</span>
        </div>
      </div>
    </div>
  );
}
