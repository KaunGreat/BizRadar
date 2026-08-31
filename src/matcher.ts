/**
 * Matcher на фронтенде: контракт повторяет backend/schemas.py
 * (MatchLocationsRequest/Response). Загрузка: сначала пробуем реальный
 * POST /api/v1/match-locations (в проде Next-фронтенд проксирует его на
 * api:8000), при недоступности бэкенда — детерминированные демо-данные,
 * сгенерированные по той же эвристике, что и backend/location_matcher.py.
 */

export interface CellSignals {
  food: number;
  offices: number;
  residential: number;
  transit: number;
  family: number;
}

export interface LocationCell {
  id: string;
  lat: number;
  lon: number;
  score: number;
  competitors: number;
  signals: CellSignals;
  district: string | null;
  reason?: string;
}

export interface MatchResult {
  city: string;
  city_name: string;
  niche: string;
  niche_title: string;
  cell_meters: number;
  source: "overpass" | "cache" | "cache_stale" | "demo";
  generated_at: string;
  cache_created_at?: string;
  note?: string;
  stats: { cells_total: number; cells_scored: number; points_total: number; competitors: number };
  top: LocationCell[];
  cells: LocationCell[];
}

export class MatcherError extends Error {}

/**
 * Статический словарь «город -> центр + bbox». Надёжное центрирование карты:
 * для этих городов координаты фиксированы; для остальных — геокодер провайдера
 * (см. geocodeCity). bbox = bbox бэкенда (CITY_BBOX) — зоны всегда внутри.
 */
export interface MatcherCity {
  key: string;
  name: string;
  center: [number, number];
  bbox: [number, number, number, number];
  supported: boolean;
}

export const MATCH_CITIES: MatcherCity[] = [
  { key: "tomsk", name: "Томск", center: [56.465, 84.955], bbox: [56.365, 84.7, 56.555, 85.1], supported: true },
  { key: "novosibirsk", name: "Новосибирск", center: [55.02, 82.92], bbox: [54.83, 82.7, 55.2, 83.2], supported: true },
  { key: "moscow", name: "Москва (вне покрытия)", center: [55.75, 37.62], bbox: [55.55, 37.35, 55.95, 37.9], supported: false },
];

export const MATCH_NICHES: { id: string; title: string; comp: number }[] = [
  { id: "coffee", title: "Кофейня «кофе с собой»", comp: 24 },
  { id: "pet", title: "Зоомагазин", comp: 11 },
  { id: "cleaning", title: "Клининг", comp: 6 },
  { id: "barber", title: "Барбершоп", comp: 13 },
  { id: "dental", title: "Стоматологический кабинет", comp: 18 },
];

export const SIGNAL_META: { key: keyof CellSignals; label: string; weight: string; cap: number; color: string }[] = [
  { key: "transit", label: "Транспорт", weight: "×1,2", cap: 8, color: "#4cc9f0" },
  { key: "residential", label: "Жильё", weight: "×1,0", cap: 10, color: "#3ce6a4" },
  { key: "food", label: "Общепит", weight: "×0,9", cap: 8, color: "#ff8a5c" },
  { key: "offices", label: "Офисы", weight: "×0,8", cap: 8, color: "#a78bfa" },
  { key: "family", label: "Семьи и школы", weight: "×0,7", cap: 6, color: "#ffc24b" },
];

export const SIGNAL_REASON: Record<keyof CellSignals, string> = {
  transit: "транспортный трафик",
  residential: "плотная жилая застройка",
  food: "сложившийся общепит — люди уже ходят сюда",
  offices: "офисный спрос в обеденные часы",
  family: "семейная аудитория рядом",
};

/* ---------- градация цвета: 0 = насыщено (красный) → 100 = окно возможностей (зелёный) ---------- */
export function heatColor(score: number): string {
  const h = 16 + (score / 100) * 124;
  return `hsl(${h.toFixed(0)} 74% 52%)`;
}

/* ---------------- карта: режимы провайдера ---------------- */
export type MapMode = "provider" | "ymaps" | "no-key" | "fallback";

/**
 * Границы для fitBounds: bbox города ∪ разброс ячеек (с отступом под радиус).
 * Карта всегда центрируется и масштабируется так, что видны ВСЕ зоны города.
 */
export function zonesExtent(cells: LocationCell[], city: MatcherCity): [[number, number], [number, number]] {
  let s = city.bbox[0];
  let w = city.bbox[1];
  let n = city.bbox[2];
  let e = city.bbox[3];
  for (const c of cells) {
    s = Math.min(s, c.lat - 0.0022);
    w = Math.min(w, c.lon - 0.0032);
    n = Math.max(n, c.lat + 0.0022);
    e = Math.max(e, c.lon + 0.0032);
  }
  return [[s, w], [n, e]];
}

/**
 * Геокодер провайдера — для городов, которых нет в статическом словаре
 * MATCH_CITIES. Яндекс отдаёт координаты в порядке [lat, lon].
 */
export function geocodeCity(
  ym: any,
  name: string
): Promise<{ center: [number, number]; bounds?: [[number, number], [number, number]] }> {
  return ym.geocode(name, { kind: "locality", results: 1 }).then((res: any) => {
    const obj = res.geoObjects.get(0);
    if (!obj) throw new Error(`геокодер: «${name}» не найден`);
    return {
      center: obj.geometry.getCoordinates() as [number, number],
      bounds: obj.properties.get("boundedBy") as [[number, number], [number, number]] | undefined,
    };
  });
}

/* ---------- детерминированный ГПСЧ ---------- */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Hotspot { lat: number; lon: number; r: number; weight: number; name: string }
interface CityDef { name: string; bbox: [number, number, number, number]; hotspots: Hotspot[] }

const CITY_DEFS: Record<string, CityDef> = {
  tomsk: {
    name: "Томск",
    bbox: [56.365, 84.7, 56.555, 85.1],
    hotspots: [
      { lat: 56.468, lon: 84.97, r: 0.01, weight: 1.0, name: "Центр / пл. Ленина" },
      { lat: 56.453, lon: 84.958, r: 0.008, weight: 0.85, name: "Академгородок" },
      { lat: 56.5, lon: 84.93, r: 0.009, weight: 0.7, name: "Каштак" },
      { lat: 56.441, lon: 85.001, r: 0.008, weight: 0.8, name: "Зелёные Горки" },
      { lat: 56.488, lon: 85.012, r: 0.007, weight: 0.6, name: "Октябрьский" },
      { lat: 56.47, lon: 84.918, r: 0.007, weight: 0.5, name: "Московский тракт" },
    ],
  },
  novosibirsk: {
    name: "Новосибирск",
    bbox: [54.83, 82.7, 55.2, 83.2],
    hotspots: [
      { lat: 55.03, lon: 82.92, r: 0.011, weight: 1.0, name: "Центральный" },
      { lat: 54.845, lon: 83.09, r: 0.009, weight: 0.75, name: "Академгородок" },
      { lat: 55.075, lon: 82.91, r: 0.008, weight: 0.7, name: "Заельцовский" },
      { lat: 54.99, lon: 82.97, r: 0.008, weight: 0.65, name: "Октябрьский" },
      { lat: 54.95, lon: 82.87, r: 0.009, weight: 0.55, name: "Ленинский" },
    ],
  },
};

const WEIGHTS: Record<keyof CellSignals, number> = { transit: 1.2, residential: 1.0, food: 0.9, offices: 0.8, family: 0.7 };
const CAPS: Record<keyof CellSignals, number> = { transit: 8, residential: 10, food: 8, offices: 8, family: 6 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- демо-генерация: та же математика, что в бэкенде ---------- */
function generateDemo(nicheId: string, cityKey: string): MatchResult {
  const city = CITY_DEFS[cityKey];
  const niche = MATCH_NICHES.find((n) => n.id === nicheId)!;
  const rnd = mulberry(hashStr(nicheId + ":" + cityKey));
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5; // ≈ нормальное, σ~0.4

  const [south, west, north, east] = city.bbox;
  const latStep = 500 / 111_320;
  const lonStep = 500 / (111_320 * Math.cos(((south + north) / 2) * (Math.PI / 180)));
  const rows = Math.ceil((north - south) / latStep);
  const cols = Math.ceil((east - west) / lonStep);

  type Pt = { lat: number; lon: number; kind: "comp" | keyof CellSignals };
  const points: Pt[] = [];
  const scatter = (h: Hotspot, kind: Pt["kind"], count: number) => {
    for (let i = 0; i < count; i++) {
      points.push({ lat: h.lat + gauss() * h.r, lon: h.lon + gauss() * h.r * 1.3, kind });
    }
  };

  // сигналы спроса вокруг «районов»
  for (const h of city.hotspots) {
    const w = h.weight;
    scatter(h, "residential", Math.round(9 * w + rnd() * 4));
    scatter(h, "food", Math.round(5 * w + rnd() * 3));
    scatter(h, "offices", Math.round(3.5 * w + rnd() * 2));
    scatter(h, "transit", Math.round(3 * w + rnd() * 2));
    scatter(h, "family", Math.round(2 * w + rnd() * 2));
  }
  // транспортный коридор («проспект»)
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    points.push({ lat: south + (north - south) * t + gauss() * 0.003, lon: west + (east - west) * (0.42 + 0.04 * rnd()), kind: "transit" });
  }
  // прямые конкуренты: больше половины — в самом горячем районе (насыщение центра)
  const h0 = city.hotspots[0];
  for (let i = 0; i < niche.comp; i++) {
    const inCore = i < niche.comp * 0.55;
    const h = inCore ? h0 : city.hotspots[Math.floor(rnd() * city.hotspots.length)];
    points.push({ lat: h.lat + gauss() * h.r * 0.8, lon: h.lon + gauss() * h.r, kind: "comp" });
  }

  // раскладка по ячейкам + скоринг (формула бэкенда)
  const grid = new Map<string, { row: number; col: number; competitors: number; signals: CellSignals }>();
  for (const p of points) {
    if (p.lat < south || p.lat > north || p.lon < west || p.lon > east) continue;
    const row = Math.floor((p.lat - south) / latStep);
    const col = Math.floor((p.lon - west) / lonStep);
    const id = `r${row}-c${col}`;
    const cell = grid.get(id) ?? { row, col, competitors: 0, signals: { food: 0, offices: 0, residential: 0, transit: 0, family: 0 } };
    if (p.kind === "comp") cell.competitors++;
    else cell.signals[p.kind]++;
    grid.set(id, cell);
  }

  let best = 0;
  const scored: (LocationCell & { raw: number })[] = [];
  for (const [id, c] of grid) {
    const raw = (Object.keys(WEIGHTS) as (keyof CellSignals)[]).reduce(
      (s, k) => s + WEIGHTS[k] * Math.min(c.signals[k], CAPS[k]),
      0
    );
    if (raw <= 0) continue;
    const opp = raw / (1 + c.competitors);
    best = Math.max(best, opp);
    const lat = south + (c.row + 0.5) * latStep;
    const lon = west + (c.col + 0.5) * lonStep;
    let district: string | null = null;
    let bd = Infinity;
    for (const h of city.hotspots) {
      const d = Math.hypot(h.lat - lat, h.lon - lon);
      if (d < bd) { bd = d; district = h.name; }
    }
    scored.push({ id, lat: +lat.toFixed(5), lon: +lon.toFixed(5), score: 0, competitors: c.competitors, signals: c.signals, district, raw: opp });
  }
  scored.sort((a, b) => b.raw - a.raw);
  for (const c of scored) c.score = +((c.raw / best) * 100).toFixed(1);

  const top = scored.slice(0, 5).map((c, i) => {
    const strongest = (Object.keys(c.signals) as (keyof CellSignals)[]).reduce((a, b) => (c.signals[a] >= c.signals[b] ? a : b));
    const compTxt = c.competitors === 0 ? "прямых конкурентов в ячейке нет" : `прямых конкурентов: ${c.competitors}`;
    return { ...c, reason: `Топ-${i + 1}: ${SIGNAL_REASON[strongest]}; ${compTxt}.` };
  });

  return {
    city: cityKey,
    city_name: city.name,
    niche: nicheId,
    niche_title: niche.title,
    cell_meters: 500,
    source: "demo",
    generated_at: new Date().toISOString(),
    stats: {
      cells_total: rows * cols,
      cells_scored: scored.length,
      points_total: points.length,
      competitors: niche.comp,
    },
    top,
    cells: scored.map(({ raw: _raw, ...c }) => c),
  };
}

/* ---------- загрузка: реальный бэкенд → fallback на демо ---------- */
export async function loadMatchLocations(nicheId: string, cityKey: string): Promise<MatchResult> {
  if (cityKey === "moscow") {
    await sleep(900);
    throw new MatcherError(
      "Город «Москва» не поддерживается Matcher'ом (HTTP 404 от бэкенда): bbox агломерации превышает лимиты публичного Overpass API. В покрытии — Томск и Новосибирск."
    );
  }
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 2200);
    const res = await fetch("/api/v1/match-locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: nicheId, city: cityKey }),
      signal: ctrl.signal,
    });
    window.clearTimeout(t);
    if (res.ok) {
      const j = (await res.json()) as MatchResult;
      if (j && Array.isArray(j.cells) && Array.isArray(j.top)) return j;
    }
  } catch {
    /* бэкенд недоступен — уходим на демо */
  }
  await sleep(1400 + Math.random() * 900);
  return generateDemo(nicheId, cityKey);
}
