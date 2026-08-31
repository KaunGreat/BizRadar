import { useCallback, useEffect, useRef, useState } from "react";
import {
  MATCH_CITIES,
  MATCH_NICHES,
  SIGNAL_META,
  heatColor,
  loadMatchLocations,
  type LocationCell,
  type MapMode,
  type MatchResult,
} from "../matcher";
import { useCountUp } from "../hooks";
import { MatcherMap } from "./MatcherMap";
import { IChevD, ICopy, IInfo, IPin, IRadar, IRefresh, IStar, ITarget } from "./icons";

const STAGES = [
  "Готовим bbox города…",
  "Запрашиваем точки в Overpass API…",
  "Раскладываем по сетке 500×500 м…",
  "Считаем opportunity = спрос / (1 + конкуренты)…",
];

function Stat({ label, value, format, color, sub }: { label: string; value: number; format: (v: number) => string; color?: string; sub?: string }) {
  const v = useCountUp(value);
  return (
    <div className="panel rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-dim">{label}</div>
      <div className="mt-1.5 font-display text-xl font-bold tabular" style={{ color: color ?? "#e9f4f8" }}>{format(v)}</div>
      {sub && <div className="mt-0.5 text-[10.5px] text-dim">{sub}</div>}
    </div>
  );
}

const SOURCE_LABEL: Record<MatchResult["source"], [string, string]> = {
  overpass: ["Overpass API · свежий снимок", "#3ce6a4"],
  cache: ["кэш · TTL 7 дней", "#4cc9f0"],
  cache_stale: ["stale-кэш · Overpass недоступен", "#ffc24b"],
  demo: ["демо-данные · бэкенд не отвечал", "#a78bfa"],
};

export function Matcher({ onToast }: { onToast: (m: string) => void }) {
  const [cityKey, setCityKey] = useState("tomsk");
  const [nicheId, setNicheId] = useState("coffee");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageTimer = useRef<number | null>(null);

  const load = useCallback(
    async (c: string, n: string) => {
      setLoading(true);
      setError(null);
      setSelectedId(null);
      setStageIdx(0);
      if (stageTimer.current) window.clearInterval(stageTimer.current);
      stageTimer.current = window.setInterval(() => setStageIdx((s) => Math.min(s + 1, STAGES.length - 1)), 700);
      try {
        const r = await loadMatchLocations(n, c);
        setResult(r);
        const [label, color] = SOURCE_LABEL[r.source];
        onToast(`Подбор локаций: ${label}`);
        void color;
      } catch (e) {
        setResult(null);
        setError(e instanceof Error ? e.message : "Неизвестная ошибка Matcher'а");
      } finally {
        if (stageTimer.current) window.clearInterval(stageTimer.current);
        setLoading(false);
      }
    },
    [onToast]
  );

  useEffect(() => {
    load(cityKey, nicheId);
    return () => {
      if (stageTimer.current) window.clearInterval(stageTimer.current);
    };
  }, [cityKey, nicheId, load]);

  const handleSelect = useCallback((c: LocationCell) => setSelectedId(c.id), []);

  /* режим карто-провайдера: тост — один раз на режим за сессию вкладки */
  const [mapMode, setMapMode] = useState<MapMode>("provider");
  const mapToastRef = useRef<Set<string>>(new Set());
  const handleMapMode = useCallback(
    (m: MapMode) => {
      setMapMode(m);
      if ((m === "no-key" || m === "fallback") && !mapToastRef.current.has(m)) {
        mapToastRef.current.add(m);
        onToast(
          m === "no-key"
            ? "Ключ Яндекс.Карт не задан (VITE_YANDEX_MAPS_KEY) — зоны показаны на офлайн-схеме"
            : "Яндекс.Карты не загрузились — зоны показаны на офлайн-схеме"
        );
      }
    },
    [onToast]
  );

  const city = MATCH_CITIES.find((c) => c.key === cityKey)!;
  const selected = result?.cells.find((c) => c.id === selectedId) ?? null;
  const [srcLabel, srcColor] = result ? SOURCE_LABEL[result.source] : ["—", "#5d7b90"];

  const copyCoords = async (c: LocationCell) => {
    try {
      await navigator.clipboard.writeText(`${c.lat}, ${c.lon}`);
      onToast(`Координаты скопированы: ${c.lat}, ${c.lon}`);
    } catch {
      onToast("Буфер обмена недоступен");
    }
  };

  return (
    <div className="space-y-5">
      {/* панель управления */}
      <div className="panel flex flex-wrap items-center gap-3 rounded-xl p-4">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-mut">
          <ITarget size={16} className="text-sig" /> Matcher · где открыться
        </span>

        <div className="relative">
          <select
            value={cityKey}
            disabled={loading}
            onChange={(e) => setCityKey(e.target.value)}
            className="appearance-none rounded-lg border border-line bg-bg1 py-2 pl-3.5 pr-9 text-[13px] font-semibold outline-none transition focus:border-cy/60 disabled:opacity-50"
          >
            {MATCH_CITIES.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
          <IChevD size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim" />
        </div>

        <div className="relative">
          <select
            value={nicheId}
            disabled={loading}
            onChange={(e) => setNicheId(e.target.value)}
            className="appearance-none rounded-lg border border-line bg-bg1 py-2 pl-3.5 pr-9 text-[13px] font-semibold outline-none transition focus:border-cy/60 disabled:opacity-50"
          >
            {MATCH_NICHES.map((n) => (
              <option key={n.id} value={n.id}>{n.title}</option>
            ))}
          </select>
          <IChevD size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim" />
        </div>

        <span className="rounded-md border border-line bg-bg2 px-2.5 py-1.5 font-mono text-[11px] text-cy">ячейка 500 м</span>

        <button
          onClick={() => load(cityKey, nicheId)}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-sig/50 px-4 py-2 text-[12.5px] font-bold text-sig transition hover:bg-sig/10 active:scale-[0.98] disabled:opacity-40"
        >
          <IRefresh size={15} className={loading ? "animate-spin" : ""} />
          {loading ? "Сканируем город…" : "Пересканировать"}
        </button>

        {result && (
          <span className="rounded-md border px-2.5 py-1.5 text-[11px] font-bold" style={{ borderColor: `${srcColor}50`, background: `${srcColor}12`, color: srcColor }}>
            {srcLabel}
          </span>
        )}

        {/* карто-провайдер */}
        <span
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-bold transition"
          style={
            mapMode === "ymaps"
              ? { borderColor: "#4cc9f050", background: "#4cc9f012", color: "#4cc9f0" }
              : mapMode === "provider"
              ? { borderColor: "#1c3a54", background: "#0f2334", color: "#5d7b90" }
              : { borderColor: "#a78bfa50", background: "#a78bfa10", color: "#a78bfa" }
          }
        >
          <span className={`h-1.5 w-1.5 rounded-full ${mapMode === "provider" ? "animate-pulse" : ""}`} style={{ background: mapMode === "ymaps" ? "#4cc9f0" : mapMode === "provider" ? "#5d7b90" : "#a78bfa", boxShadow: mapMode === "ymaps" ? "0 0 6px #4cc9f0" : undefined }} />
          {mapMode === "ymaps" ? "Яндекс.Карты · fit по зонам" : mapMode === "provider" ? "загрузка карты…" : "офлайн-схема"}
        </span>
      </div>

      {/* статистика */}
      {result && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="Ячеек со спросом" value={result.stats.cells_scored} format={(v) => v.toLocaleString("ru-RU")} sub={`из ${result.stats.cells_total.toLocaleString("ru-RU")} в сетке`} color="#4cc9f0" />
          <Stat label="Точек OSM в снимке" value={result.stats.points_total} format={(v) => v.toLocaleString("ru-RU")} sub="конкуренты + сигналы" />
          <Stat label="Прямых конкурентов" value={result.stats.competitors} format={(v) => String(v)} color={result.stats.competitors > 15 ? "#ffc24b" : "#3ce6a4"} sub={`ниша «${result.niche_title}»`} />
          <Stat label="Топ-локаций в подборке" value={result.top.length} format={(v) => String(v)} color="#3ce6a4" sub="клик ведёт к ячейке" />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        {/* карта + оверлеи */}
        <div className="relative min-w-0">
          <MatcherMap
            cells={result?.cells ?? []}
            top={result?.top ?? []}
            selected={selected}
            onSelect={handleSelect}
            city={city}
            onModeChange={handleMapMode}
          />

          {/* загрузка */}
          {loading && (
            <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center rounded-xl border border-line bg-bg0/88 backdrop-blur-[3px] anim-fade">
              <IRadar size={46} className="text-sig spin-slow" />
              <div className="mt-5 font-display text-sm font-bold">Сканируем {city.name}</div>
              <div key={stageIdx} className="mt-2 h-4 font-mono text-[11.5px] text-mut anim-rise">{STAGES[stageIdx]}</div>
              <div className="mt-5 h-1 w-56 overflow-hidden rounded-full bg-bg3">
                <div className="h-full w-1/3 rounded-full bg-sig" style={{ animation: "sweepBar 1.4s ease-in-out infinite", boxShadow: "0 0 10px #3ce6a4" }} />
              </div>
              <p className="mt-4 max-w-xs text-center text-[11px] leading-relaxed text-dim">
                Запрос по всему городу тяжёлый: Overpass может отвечать до 30 секунд. Повторные запросы берутся из кэша (TTL 7 дней).
              </p>
            </div>
          )}

          {/* ошибка */}
          {error && !loading && (
            <div className="absolute inset-0 z-[600] flex items-center justify-center rounded-xl border border-cor/40 bg-bg0/92 backdrop-blur-[3px] anim-fade">
              <div className="max-w-md rounded-xl border border-cor/40 bg-cor/[0.06] p-6 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-cor/50 bg-cor/10 font-display text-lg font-bold text-cor">!</div>
                <div className="mt-3 font-display text-sm font-bold text-cor">Matcher не смог построить карту</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-mut">{error}</p>
                <button
                  onClick={() => load(cityKey, nicheId)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-bg2 px-4 py-2 text-[12.5px] font-bold text-ink transition hover:border-cy/50 hover:text-cy"
                >
                  <IRefresh size={14} /> Повторить запрос
                </button>
              </div>
            </div>
          )}
        </div>

        {/* правая колонка */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* топ */}
          <div className="panel overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-mut">Топ локаций</span>
              <span className="text-[10.5px] text-dim">клик = перелёт карты</span>
            </div>
            {!result && !error && (
              <div className="space-y-2.5 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-bg2" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
            {result &&
              result.top.map((c, i) => {
                const color = heatColor(c.score);
                const active = selectedId === c.id;
                const strongest = SIGNAL_META.reduce((a, b) => (c.signals[a.key] / a.cap >= c.signals[b.key] / b.cap ? a : b));
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full items-center gap-3 border-b border-linesoft px-4 py-3 text-left transition last:border-0 ${active ? "bg-bg2" : "hover:bg-bg2/60 hover:translate-x-0.5"}`}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[12px] font-bold"
                      style={{ color, border: `1.5px solid ${color}`, background: `${color}14`, boxShadow: i === 0 ? `0 0 10px ${color}66` : undefined }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold">{c.district ?? c.id}</span>
                        <span className="font-mono text-[9.5px] text-dim">{c.id}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="h-1 w-20 overflow-hidden rounded-full bg-bg3">
                          <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${c.score}%`, background: color }} />
                        </span>
                        <span className="text-[10.5px] text-mut">{strongest.label.toLowerCase()} · конкурентов: {c.competitors}</span>
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md px-2 py-1 font-display text-[13px] font-bold tabular" style={{ color, background: `${color}14` }}>
                      {c.score.toFixed(0)}
                    </span>
                  </button>
                );
              })}
            {error && !loading && <div className="p-4 text-[12px] text-dim">Подборка недоступна — исправьте ошибку слева.</div>}
          </div>

          {/* детали ячейки */}
          <div className="panel rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-mut">
                <IPin size={14} className="text-cy" /> Детали ячейки
              </span>
              {selected && (
                <button onClick={() => copyCoords(selected)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[10.5px] text-mut transition hover:border-cy/50 hover:text-cy">
                  <ICopy size={12} /> {selected.lat}, {selected.lon}
                </button>
              )}
            </div>

            {!selected ? (
              <p className="mt-3 text-[12.5px] leading-relaxed text-dim">
                Кликните по зоне на карте или строке топа — покажем разбивку сигналов спроса и конкурентов в ячейке 500×500 м.
              </p>
            ) : (
              <div key={selected.id} className="anim-rise mt-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-[15px] font-bold">{selected.district ?? "вне районов"}</div>
                    <div className="font-mono text-[10.5px] text-dim">{selected.id} · центроид для пеших обходов</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-3xl font-bold tabular" style={{ color: heatColor(selected.score) }}>
                      {selected.score.toFixed(0)}
                    </div>
                    <div className="text-[9.5px] uppercase tracking-wider text-dim">score / 100</div>
                  </div>
                </div>

                {selected.reason && (
                  <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-sig/25 bg-sig/[0.05] px-3 py-2 text-[12px] leading-relaxed text-mut">
                    <IStar size={13} className="mt-0.5 shrink-0 text-sig" /> {selected.reason}
                  </p>
                )}

                <div className="mt-3.5 space-y-2">
                  {SIGNAL_META.map((s, i) => {
                    const count = selected.signals[s.key];
                    const pct = Math.min(100, (count / s.cap) * 100);
                    return (
                      <div key={s.key}>
                        <div className="flex items-baseline justify-between text-[11px]">
                          <span className="text-mut">{s.label} <span className="font-mono text-[9.5px] text-dim">{s.weight}</span></span>
                          <span className="tabular font-semibold text-ink">{count} <span className="font-mono text-[9px] text-dim">/ {s.cap}</span></span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg3">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: s.color, transitionDelay: `${i * 60}ms`, boxShadow: `0 0 6px ${s.color}55` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3.5 flex items-center justify-between rounded-lg border border-linesoft bg-bg2/60 px-3 py-2.5">
                  <span className="text-[11.5px] text-mut">Прямые конкуренты в ячейке</span>
                  <span className={`font-display text-[15px] font-bold tabular ${selected.competitors === 0 ? "text-sig" : selected.competitors <= 3 ? "text-amb" : "text-cor"}`}>
                    {selected.competitors}
                  </span>
                </div>
              </div>
            )}
          </div>

          <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-dim">
            <IInfo size={13} className="mt-0.5 shrink-0 text-cy" />
            <span>
              Скор ячейки: <code className="font-mono text-[10.5px] text-mut">opportunity = Σ(вес · min(сигнал, потолок)) / (1 + конкуренты)</code>,
              нормировка на 100 по городу. Красные зоны — спрос есть, но ниша поделена; зелёные — окно возможностей.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
