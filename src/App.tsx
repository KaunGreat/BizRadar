import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CATEGORIES_LIST,
  CITIES,
  NICHES,
  fmtNum,
  scoreColor,
  type Category,
  type Niche,
} from "./data";
import { useCountUp } from "./hooks";
import { Spark } from "./components/charts";
import { RadarScope, ScanLog } from "./components/RadarScope";
import { CityMap } from "./components/CityMap";
import { Matcher } from "./components/Matcher";
import { NichePanel } from "./components/NichePanel";
import { Finance, type Prefill } from "./components/Finance";
import { Marketplace } from "./components/Marketplace";
import { DataView } from "./components/DataView";
import { AiLayer } from "./components/AiLayer";
import {
  ICalc,
  ICheck,
  IChip,
  IChevD,
  ICompass,
  ICpu,
  IFlame,
  IMap,
  IRadar,
  IRefresh,
  ISearch,
  IStore,
  ITarget,
  ITrendDown,
  ITrendUp,
  IUsers,
} from "./components/icons";

type View = "radar" | "map" | "matcher" | "finance" | "market" | "ai" | "data";

const NAV: { key: View; label: string; icon: (p: { size?: number; className?: string }) => ReactNode }[] = [
  { key: "radar", label: "Нишевый радар", icon: (p) => <IRadar {...p} /> },
  { key: "map", label: "Карта конкурентов", icon: (p) => <IMap {...p} /> },
  { key: "matcher", label: "Подбор локации", icon: (p) => <ITarget {...p} /> },
  { key: "finance", label: "Финансы", icon: (p) => <ICalc {...p} /> },
  { key: "market", label: "Маркетплейс", icon: (p) => <IStore {...p} /> },
  { key: "ai", label: "ИИ-слой · GigaChat", icon: (p) => <ICpu {...p} /> },
  { key: "data", label: "Платформа", icon: (p) => <IChip {...p} /> },
];

const VIEW_META: Record<View, { title: string; sub: string }> = {
  radar: { title: "Нишевый радар", sub: "Scout · скоринг выживаемости v1 по данным OSM и региональной статистике" },
  map: { title: "Карта конкурентов", sub: "Слой точек из Overpass API · кэш MarketSnapshot, TTL 7 дней" },
  matcher: { title: "Подбор локации", sub: "Matcher · сетка ~500 м · opportunity = спрос / (1 + конкуренты) · кэш 7 дней" },
  finance: { title: "Финансовая модель", sub: "Finance · юнит-экономика точки и срок возврата вложений" },
  market: { title: "Маркетплейс партнёров", sub: "Marketplace · CPA-лиды банкам, SaaS франшизам, скидки подрядчиков" },
  ai: { title: "ИИ-слой · GigaChat", sub: "RussianLLMService: реальный вызов с fallback на заглушку · services/ai_service.py" },
  data: { title: "Платформа BizRadar", sub: "Модули, маховик монетизации, roadmap и API бэкенда" },
};

const BOOT_LINES = [
  "Подключение к Overpass API (OpenStreetMap)",
  "MarketSnapshot · кэш снимка рынка (TTL 7 дней)",
  "Эвристика выживаемости v1 · пересчёт 16 ниш",
  "RussianLLM: GigaChat подключён · без ключа → fallback на заглушку",
];

function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="21" fill="#0f2334" stroke="#1c3a54" />
      <circle cx="24" cy="24" r="13" fill="none" stroke="#1c3a54" />
      <circle cx="24" cy="24" r="5.5" fill="none" stroke="#1c3a54" />
      <g style={{ transformOrigin: "24px 24px" }} className="spin-slow">
        <line x1="24" y1="24" x2="45" y2="24" stroke="#3ce6a4" strokeWidth="2" strokeLinecap="round" />
        <path d="M24 24 L44.2 17.5 A21 21 0 0 1 45 24 Z" fill="#3ce6a4" opacity="0.25" />
      </g>
      <circle cx="24" cy="24" r="2.6" fill="#3ce6a4" />
      <circle cx="32" cy="15" r="2" fill="#ffc24b" />
      <circle cx="15" cy="30" r="2" fill="#4cc9f0" />
    </svg>
  );
}

function StatTile({
  icon,
  label,
  target,
  format,
  sub,
  color = "#e9f4f8",
  delay,
}: {
  icon: ReactNode;
  label: string;
  target: number;
  format: (v: number) => string;
  sub: string;
  color?: string;
  delay: string;
}) {
  const v = useCountUp(target);
  return (
    <div className="panel rounded-xl p-4 anim-rise" style={{ animationDelay: delay }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-dim">{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular" style={{ color }}>{format(v)}</div>
      <div className="mt-1 text-[11px] text-dim">{sub}</div>
    </div>
  );
}

function BootScreen({ step }: { step: number }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg0">
      <div className="grid-bg absolute inset-0 opacity-50" />
      <div className="relative w-[min(420px,90vw)]">
        <div className="flex items-center gap-4">
          <LogoMark size={52} />
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight">
              Biz<span className="text-sig">Radar</span>
            </div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-dim">радар бизнес-ниш</div>
          </div>
        </div>
        <div className="mt-7 space-y-2.5">
          {BOOT_LINES.map((l, i) => (
            <div key={l} className={`flex items-center gap-2.5 text-[12.5px] transition-opacity duration-300 ${i <= step ? "opacity-100" : "opacity-20"}`}>
              {i < step ? (
                <ICheck size={14} className="text-sig" />
              ) : i === step ? (
                <IRefresh size={14} className="animate-spin text-cy" />
              ) : (
                <span className="inline-block h-[14px] w-[14px] rounded-full border border-line" />
              )}
              <span className={i <= step ? "text-mut" : "text-dim"}>{l}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-bg3">
          <div className="h-full rounded-full bg-sig transition-all duration-500" style={{ width: `${(step / BOOT_LINES.length) * 100}%`, boxShadow: "0 0 10px #3ce6a4" }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [boot, setBoot] = useState(true);
  const [bootStep, setBootStep] = useState(0);
  const [view, setView] = useState<View>("radar");
  const [cityIdx, setCityIdx] = useState(0);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"Все" | Category>("Все");
  const [sort, setSort] = useState<"score" | "delta" | "rev" | "startup">("score");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapNicheId, setMapNicheId] = useState("coffee");
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [financeNiche, setFinanceNiche] = useState<Niche | null>(null);
  const [snapshotAt, setSnapshotAt] = useState(() => Date.now() - 2.3 * 86_400_000);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);

  useEffect(() => {
    if (!boot) return;
    if (bootStep < BOOT_LINES.length) {
      const t = window.setTimeout(() => setBootStep((s) => s + 1), 440);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setBoot(false), 520);
    return () => window.clearTimeout(t);
  }, [boot, bootStep]);

  const city = CITIES[cityIdx];

  const pushToast = (msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  };

  const filtered = useMemo(() => {
    let list = NICHES.filter(
      (n) =>
        (cat === "Все" || n.category === cat) &&
        (query.trim() === "" || n.title.toLowerCase().includes(query.trim().toLowerCase()))
    );
    list = [...list].sort((a, b) =>
      sort === "score" ? b.score - a.score : sort === "delta" ? b.delta - a.delta : sort === "rev" ? b.monthly - a.monthly : a.startup - b.startup
    );
    return list;
  }, [cat, query, sort]);

  const selected = NICHES.find((n) => n.id === selectedId) ?? null;
  const mapNiche = NICHES.find((n) => n.id === mapNicheId) ?? NICHES[0];

  const avgScore = Math.round(NICHES.reduce((s, n) => s + n.score, 0) / NICHES.length);
  const totalPoints = Math.round(NICHES.reduce((s, n) => s + n.competitors.length, 0) * Math.min(city.k, 2));
  const hotCount = NICHES.filter((n) => n.score >= 78).length;
  const snapshotAge = (Date.now() - snapshotAt) / 86_400_000;

  const refreshSnapshot = () => {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => {
      setSnapshotAt(Date.now());
      setRefreshing(false);
      pushToast("MarketSnapshot обновлён · кэш на 7 дней");
    }, 1500);
  };

  const openFinance = (n: Niche) => {
    setPrefill({ check: n.avgCheck, startup: n.startup, margin: n.margin, title: n.title });
    setFinanceNiche(n);
    setSelectedId(null);
    setView("finance");
    pushToast(`Параметры «${n.title}» подставлены в калькулятор`);
  };

  const openMap = (id: string) => {
    setMapNicheId(id);
    setSelectedId(null);
    setView("map");
  };

  const resetFilters = () => {
    setCat("Все");
    setQuery("");
    setSort("score");
  };

  return (
    <div className="min-h-screen font-body text-ink">
      {boot && <BootScreen step={bootStep} />}

      {/* ---------- sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r border-line bg-bg1/80 backdrop-blur lg:w-60">
        <div className="flex items-center gap-3 px-3 py-5 lg:px-5">
          <LogoMark />
          <div className="hidden lg:block">
            <div className="font-display text-[17px] font-extrabold leading-none tracking-tight">
              Biz<span className="text-sig">Radar</span>
            </div>
            <div className="mt-1 text-[9.5px] uppercase tracking-[0.22em] text-dim">радар ниш · v0.4</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-2 lg:px-3">
          {NAV.map((n) => {
            const active = view === n.key;
            return (
              <button
                key={n.key}
                onClick={() => setView(n.key)}
                className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${
                  active ? "bg-bg2 text-ink" : "text-mut hover:bg-bg2/60 hover:text-ink"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sig" style={{ boxShadow: "0 0 8px #3ce6a4" }} />}
                <span className={`shrink-0 transition ${active ? "text-sig" : "text-dim group-hover:text-cy"}`}>{n.icon({ size: 18 })}</span>
                <span className="hidden lg:inline">{n.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="hidden border-t border-line px-4 py-4 text-[11px] leading-relaxed text-dim lg:block">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-sig animate-pulse" />
            <span className="text-mut">FastAPI · онлайн</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-sig" />
            <span>LLM: GigaChat + fallback на заглушку</span>
          </div>
        </div>
      </aside>

      {/* ---------- main ---------- */}
      <div className="ml-16 lg:ml-60">
        {/* header */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg0/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-5 py-3.5 lg:px-8">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-bold leading-tight">{VIEW_META[view].title}</h1>
              <p className="truncate text-[11.5px] text-dim">{VIEW_META[view].sub}</p>
            </div>

            {view === "radar" && (
              <div className="relative order-3 w-full sm:order-none sm:w-60">
                <ISearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск ниши…"
                  className="w-full rounded-lg border border-line bg-bg1 py-2 pl-9 pr-3 text-[13px] outline-none transition placeholder:text-dim focus:border-cy/60"
                />
              </div>
            )}

            <div className="relative">
              <ICompass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cy" />
              <select
                value={cityIdx}
                onChange={(e) => {
                  setCityIdx(Number(e.target.value));
                  pushToast(`Регион переключён: ${CITIES[Number(e.target.value)].name}`);
                }}
                className="appearance-none rounded-lg border border-line bg-bg1 py-2 pl-9 pr-8 text-[13px] outline-none transition focus:border-cy/60"
              >
                {CITIES.map((c, i) => (
                  <option key={c.name} value={i}>{c.name}</option>
                ))}
              </select>
              <IChevD size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dim" />
            </div>

            <div className="hidden items-center gap-2.5 rounded-lg border border-line bg-bg1 px-3 py-1.5 md:flex">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-dim">снимок рынка</div>
                <div className="text-[12px] font-semibold leading-tight tabular">
                  {snapshotAge < 1 ? "сегодня" : `${Math.floor(snapshotAge)} дн назад`}
                </div>
                <div className="mt-1 h-[3px] w-24 overflow-hidden rounded-full bg-bg3">
                  <div className="h-full rounded-full bg-cy" style={{ width: `${Math.min(100, (snapshotAge / 7) * 100)}%` }} />
                </div>
              </div>
              <button
                onClick={refreshSnapshot}
                className={`rounded-md border border-line p-1.5 text-mut transition hover:border-cy/60 hover:text-cy ${refreshing ? "pointer-events-none" : ""}`}
                aria-label="Обновить снимок"
              >
                <IRefresh size={15} className={refreshing ? "animate-spin text-cy" : ""} />
              </button>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-sig/40 bg-sig/10 font-display text-[11px] font-bold text-sig" title="Профиль (демо)">
              АП
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-5 py-6 lg:px-8">
          {/* ================= RADAR ================= */}
          {view === "radar" && (
            <div key="radar" className="space-y-5">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatTile delay="0s" icon={<IRadar size={17} className="text-sig" />} label="Целей на радаре" target={filtered.length} format={(v) => fmtNum(v)} sub="ниш в скоринге v1" />
                <StatTile delay="0.06s" icon={<ITarget size={17} className="text-cy" />} label="Средний балл" target={avgScore} format={(v) => `${Math.round(v)}`} sub="шкала радара 0–100" color={scoreColor(avgScore)} />
                <StatTile delay="0.12s" icon={<IUsers size={17} className="text-cy" />} label="Точек конкурентов" target={totalPoints} format={(v) => fmtNum(v)} sub="OSM Overpass API" />
                <StatTile delay="0.18s" icon={<IFlame size={17} className="text-amb" />} label="Горячие ниши" target={hotCount} format={(v) => fmtNum(v)} sub="балл 78 и выше" color="#ffc24b" />
              </div>

              <div className="grid gap-5 xl:grid-cols-[520px_1fr]">
                <div className="panel rounded-xl p-5 anim-rise d2">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-display text-sm font-bold">Скан рынка · {city.name}</h2>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-sig">
                      <span className="h-1.5 w-1.5 rounded-full bg-sig animate-pulse" />
                      сканирование
                    </span>
                  </div>
                  <RadarScope niches={filtered} selected={selectedId} onSelect={setSelectedId} />
                  <div className="mt-4">
                    <ScanLog />
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4 anim-rise d3">
                  {/* filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    {(["Все", ...CATEGORIES_LIST] as const).map((c) => {
                      const count = c === "Все" ? NICHES.length : NICHES.filter((n) => n.category === c).length;
                      const active = cat === c;
                      return (
                        <button
                          key={c}
                          onClick={() => setCat(c)}
                          className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
                            active ? "border-cy/60 bg-cy/10 text-cy" : "border-line bg-bg1 text-mut hover:text-ink"
                          }`}
                        >
                          {c} <span className={`tabular ${active ? "text-cy/70" : "text-dim"}`}>{count}</span>
                        </button>
                      );
                    })}
                    <div className="relative ml-auto">
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as typeof sort)}
                        className="appearance-none rounded-lg border border-line bg-bg1 py-1.5 pl-3 pr-8 text-[12px] text-mut outline-none focus:border-cy/60"
                      >
                        <option value="score">По баллу</option>
                        <option value="delta">По динамике</option>
                        <option value="rev">По выручке</option>
                        <option value="startup">По вложениям</option>
                      </select>
                      <IChevD size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dim" />
                    </div>
                  </div>

                  {/* list */}
                  <div className="panel min-h-[300px] flex-1 overflow-hidden rounded-xl">
                    {filtered.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
                        <ISearch size={34} className="text-dim" />
                        <div className="font-display text-sm font-bold">Ничего не найдено</div>
                        <p className="max-w-xs text-[12.5px] text-mut">
                          По запросу «{query}» в категории «{cat}» ниш нет. Попробуйте сбросить фильтры.
                        </p>
                        <button onClick={resetFilters} className="mt-1 rounded-lg border border-cy/50 px-4 py-2 text-[12.5px] font-semibold text-cy transition hover:bg-cy/10">
                          Сбросить фильтры
                        </button>
                      </div>
                    ) : (
                      <div className="max-h-[660px] overflow-y-auto scroll-slim">
                        {filtered.map((n, i) => {
                          const col = scoreColor(n.score);
                          const isSel = selectedId === n.id;
                          return (
                            <button
                              key={n.id}
                              onClick={() => setSelectedId(n.id)}
                              className={`flex w-full items-center gap-3.5 border-b border-linesoft px-4 py-3 text-left transition last:border-0 ${
                                isSel ? "bg-bg2" : "hover:bg-bg2/50"
                              }`}
                            >
                              <span className="w-6 shrink-0 font-display text-[12px] font-bold text-dim tabular">{i + 1}</span>
                              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: col, boxShadow: `0 0 8px ${col}55` }} />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="truncate text-[14px] font-semibold">{n.title}</span>
                                  <span className="hidden rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider sm:inline" style={{ color: "#8facc0", background: "#14293c" }}>
                                    {n.category}
                                  </span>
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-dim">{n.tags.join(" · ")}</span>
                              </span>
                              <span className="hidden md:block shrink-0">
                                <Spark data={n.demand} color={col} w={76} h={26} />
                              </span>
                              <span className={`hidden shrink-0 items-center gap-1 text-[11.5px] font-semibold tabular sm:inline-flex ${n.delta >= 0 ? "text-sig" : "text-cor"}`}>
                                {n.delta >= 0 ? <ITrendUp size={13} /> : <ITrendDown size={13} />}
                                {n.delta >= 0 ? "+" : ""}{n.delta}
                              </span>
                              <span className="shrink-0 rounded-lg px-2.5 py-1.5 font-display text-[14px] font-bold tabular" style={{ color: col, background: `${col}14`, border: `1px solid ${col}33` }}>
                                {n.score}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-dim">
                    Клик по цели на радаре или строке списка открывает карточку ниши: под-баллы, спрос за 12 месяцев, ИИ-инсайт и конкуренты.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= MAP ================= */}
          {view === "map" && (
            <div key="map" className="space-y-4 anim-rise">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-mut">Ниша:</span>
                <div className="relative">
                  <select
                    value={mapNicheId}
                    onChange={(e) => setMapNicheId(e.target.value)}
                    className="appearance-none rounded-lg border border-line bg-bg1 py-2 pl-3.5 pr-9 text-[13px] font-semibold outline-none focus:border-cy/60"
                  >
                    {NICHES.map((n) => (
                      <option key={n.id} value={n.id}>{n.title} · {n.score}</option>
                    ))}
                  </select>
                  <IChevD size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim" />
                </div>
                <span className="text-[12px] text-dim">выбор ниши перестраивает слой конкурентов</span>
              </div>
              <CityMap key={`${mapNicheId}-${city.name}`} niche={mapNiche} cityK={city.k} cityName={city.name} />
            </div>
          )}

          {/* ================= MATCHER ================= */}
          {view === "matcher" && (
            <div key="matcher" className="anim-rise">
              <Matcher onToast={pushToast} />
            </div>
          )}

          {/* ================= FINANCE ================= */}
          {view === "finance" && (
            <div key="finance" className="anim-rise">
              <Finance prefill={prefill} city={city} niche={financeNiche} />
            </div>
          )}

          {/* ================= MARKET ================= */}
          {view === "market" && (
            <div key="market" className="anim-rise">
              <Marketplace onToast={pushToast} />
            </div>
          )}

          {/* ================= AI LAYER ================= */}
          {view === "ai" && (
            <div key="ai" className="anim-rise">
              <AiLayer onToast={pushToast} />
            </div>
          )}

          {/* ================= DATA ================= */}
          {view === "data" && (
            <div key="data" className="anim-rise">
              <DataView onToast={pushToast} />
            </div>
          )}

          <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-linesoft pt-5 pb-2 text-[11px] text-dim">
            <span>BizRadar · учебный прототип фронтенда (Next.js + Tailwind в проде) · данные демонстрационные</span>
            <span className="font-mono">backend: FastAPI · snapshot TTL 7d · LLM: GigaChat (fallback stub)</span>
          </footer>
        </main>
      </div>

      {/* ---------- niche panel ---------- */}
      {selected && (
        <NichePanel
          niche={selected}
          city={city}
          onClose={() => setSelectedId(null)}
          onFinance={() => openFinance(selected)}
          onMap={() => openMap(selected.id)}
        />
      )}

      {/* ---------- toasts ---------- */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(360px,90vw)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-sig/35 bg-bg2/95 px-3.5 py-2.5 text-[12.5px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] backdrop-blur anim-rise">
            <ICheck size={15} className="shrink-0 text-sig" />
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
