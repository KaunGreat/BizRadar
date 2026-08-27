import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { heatColor, type LocationCell } from "../matcher";

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function MatcherMap({
  cells,
  top,
  selected,
  onSelect,
  center,
}: {
  cells: LocationCell[];
  top: LocationCell[];
  selected: LocationCell | null;
  onSelect: (c: LocationCell) => void;
  center: [number, number];
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [tilesDown, setTilesDown] = useState(false);

  /* инициализация карты — один раз */
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { center, zoom: 12, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const tiles = L.tileLayer(TILE_URL, {
      subdomains: "abcd",
      maxZoom: 17,
      attribution: "© OpenStreetMap · © CARTO",
    });
    let errs = 0;
    tiles.on("tileerror", () => {
      if (++errs > 6) setTilesDown(true);
    });
    tiles.addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* смена города */
  const centerKey = `${center[0]},${center[1]}`;
  useEffect(() => {
    mapRef.current?.setView(center, 12, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey]);

  /* ячейки: перестройка слоя */
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    cells.forEach((c, i) => {
      const color = heatColor(c.score);
      const isSel = selected?.id === c.id;
      const circle = L.circle([c.lat, c.lon], {
        radius: 230,
        color: isSel ? "#e9f4f8" : color,
        weight: isSel ? 2.6 : 1,
        opacity: isSel ? 1 : 0.85,
        fillColor: color,
        fillOpacity: 0.16 + (c.score / 100) * 0.42,
        className: "cell-circle",
      });
      circle.bindTooltip(
        `<b style="color:${color}">score ${c.score.toFixed(0)}</b>&nbsp;· конкурентов: ${c.competitors}`,
        { direction: "top", className: "biz-tip", opacity: 1 }
      );
      circle.on("click", () => onSelect(c));
      circle.addTo(layer);
      const el = circle.getElement() as SVGElement | undefined;
      if (el) el.style.animationDelay = `${Math.min(i * 5, 650)}ms`;
    });

    /* бейджи топ-подборки */
    top.forEach((t, i) => {
      const color = i === 0 ? "#3ce6a4" : i === 1 ? "#b8e64c" : "#e9f4f8";
      L.marker([t.lat, t.lon], {
        icon: L.divIcon({
          className: "rank-badge",
          html: `<span style="color:${color};border-color:${color};${i === 0 ? "box-shadow:0 0 12px rgba(60,230,164,.8)" : ""}">${i + 1}</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
    });

    /* пульс на топ-1 */
    if (top[0]) {
      L.circle([top[0].lat, top[0].lon], {
        radius: 250,
        color: "#3ce6a4",
        weight: 2,
        fill: false,
        className: "pulse-top",
        interactive: false,
      }).addTo(layer);
    }
  }, [cells, top, selected?.id, onSelect]);

  /* перелёт к выбранной ячейке */
  useEffect(() => {
    if (!mapRef.current || !selected) return;
    mapRef.current.flyTo([selected.lat, selected.lon], 14, { duration: 0.7 });
  }, [selected?.lat, selected?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-bg1">
      <div ref={divRef} className="h-[560px] w-full leaflet-biz" />

      {tilesDown && (
        <span className="absolute left-3 top-3 z-[500] rounded-md border border-amb/45 bg-bg1/90 px-2.5 py-1 text-[10.5px] font-semibold text-amb backdrop-blur">
          тайлы карты недоступны — зоны показаны без подложки
        </span>
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
