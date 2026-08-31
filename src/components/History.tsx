import { useCallback, useEffect, useState } from "react";
import { MONTHS, fmtMoney, fmtShort, scoreColor, scoreLabel } from "../data";
import { deleteProject, formatDate, loadProjects, type ProjectRecord } from "../projects";
import { AreaChart, ScoreRing } from "./charts";
import { IArrowR, IChevD, IClock, ICpu, IPin, IRefresh, IStar, IX } from "./icons";

const BREAKDOWN_LABELS: { key: "demand" | "competition" | "margin" | "entry" | "trend"; label: string }[] = [
  { key: "demand", label: "Спрос" },
  { key: "competition", label: "Конкуренция" },
  { key: "margin", label: "Маржа" },
  { key: "entry", label: "Вход" },
  { key: "trend", label: "Тренд" },
];

export function History({
  onToast,
  onOpenNiche,
  onGoRadar,
}: {
  onToast: (msg: string) => void;
  onOpenNiche: (nicheId: string) => void;
  onGoRadar: () => void;
}) {
  const [items, setItems] = useState<ProjectRecord[] | null>(null);
  const [source, setSource] = useState<"api" | "local">("local");
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [busyId, setBusyId] = useState<number | string | null>(null);

  const reload = useCallback(async (silent = false) => {
    const r = await loadProjects();
    setItems(r.items);
    setSource(r.source);
    if (!silent && r.items.length) onToast("История обновлена");
  }, [onToast]);

  useEffect(() => {
    reload(true);
  }, [reload]);

  const selected = items?.find((r) => String(r.id) === String(selectedId)) ?? null;

  const remove = async (rec: ProjectRecord) => {
    setBusyId(rec.id);
    await deleteProject(rec.id);
    setItems((prev) => (prev ? prev.filter((r) => String(r.id) !== String(rec.id)) : prev));
    if (String(selectedId) === String(rec.id)) setSelectedId(null);
    setBusyId(null);
    onToast(`«${rec.niche_title}» удалён из истории`);
  };

  /* ---------- пустое состояние ---------- */
  if (items && items.length === 0) {
    return (
      <div className="anim-rise flex min-h-[480px] flex-col items-center justify-center rounded-xl border border-dashed border-line bg-bg1/40 p-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-cy/40 bg-cy/[0.07] text-cy">
          <IClock size={30} />
        </span>
        <h2 className="mt-5 font-display text-lg font-bold">Сохранённых анализов пока нет</h2>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-mut">
          Выберите нишу на радаре и нажмите «Сохранить анализ» — запись появится здесь со скором,
          метриками и отчётом. Открыть её можно будет в один клик, без повторного сканирования.
        </p>
        <button
          onClick={onGoRadar}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-sig px-5 py-3 font-display text-[13px] font-bold text-bg0 transition hover:brightness-110 active:scale-[0.98]"
        >
          Проанализировать нишу <IArrowR size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* шапка раздела */}
      <div className="anim-rise flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[15px] font-bold">
          {items ? `${items.length} ${items.length === 1 ? "анализ" : items.length < 5 ? "анализа" : "анализов"}` : "…"}
        </h2>
        <span
          className="rounded-md border px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider"
          style={
            source === "api"
              ? { borderColor: "#3ce6a450", background: "#3ce6a410", color: "#3ce6a4" }
              : { borderColor: "#a78bfa50", background: "#a78bfa0f", color: "#a78bfa" }
          }
        >
          {source === "api" ? "хранилище: сервер" : "хранилище: браузер"}
        </span>
        <button
          onClick={() => reload()}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[12px] font-semibold text-mut transition hover:border-cy/50 hover:text-cy"
        >
          <IRefresh size={14} /> Обновить
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        {/* ---------- список ---------- */}
        <div className="panel anim-rise d1 min-h-[300px] overflow-hidden rounded-xl">
          {!items ? (
            <div className="space-y-2.5 p-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-bg2" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          ) : (
            <div className="max-h-[640px] overflow-y-auto scroll-slim">
              {items.map((r) => {
                const col = scoreColor(r.score);
                const active = String(selectedId) === String(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`relative flex w-full items-center gap-3.5 border-b border-linesoft px-4 py-3.5 text-left transition last:border-0 ${
                      active ? "bg-bg2" : "hover:bg-bg2/50 hover:translate-x-0.5"
                    }`}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-9 w-[3px] -translate-y-1/2 rounded-r bg-sig" style={{ boxShadow: "0 0 8px #3ce6a4" }} />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold">{r.niche_title}</span>
                        {r.has_report && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-sig/40 bg-sig/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sig">
                            <ICpu size={11} /> отчёт
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-dim">
                        <IPin size={12} className="text-cy/70" />
                        {r.city_name || "город не указан"}
                        <span className="text-linesoft">·</span>
                        <IClock size={12} />
                        {formatDate(r.created_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-md px-2 py-1 font-display text-[13.5px] font-bold tabular" style={{ color: col, background: `${col}14`, border: `1px solid ${col}33` }}>
                        {Math.round(r.score)}
                      </span>
                      <span className="text-[10px] text-dim tabular">год: {r.survival}%</span>
                    </span>
                    <IChevD size={14} className={`shrink-0 -rotate-90 text-dim transition ${active ? "text-sig" : ""}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------- детали ---------- */}
        <div className="anim-rise d2 min-w-0">
          {!selected ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-xl border border-line bg-bg1/50 p-10 text-center">
              <IStar size={26} className="text-dim" />
              <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-dim">
                Выберите запись слева — покажем скор, метрики и отчёт ровно в том виде, в каком анализ был сохранён.
              </p>
            </div>
          ) : (
            <div key={String(selected.id)} className="space-y-4">
              {/* скор + выживаемость */}
              <div className="panel rounded-xl p-5 anim-fade">
                <div className="flex flex-wrap items-center gap-5">
                  <ScoreRing value={selected.score} color={scoreColor(selected.score)} sub="балл" size={118} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-bold leading-tight">{selected.niche_title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-mut">
                      <span className="inline-flex items-center gap-1"><IPin size={12} className="text-cy" /> {selected.city_name || "город не указан"}</span>
                      <span className="text-linesoft">·</span>
                      <span className="inline-flex items-center gap-1"><IClock size={12} /> {formatDate(selected.created_at)}</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-md px-2 py-1 text-[11px] font-bold" style={{ background: `${scoreColor(selected.score)}15`, color: scoreColor(selected.score) }}>
                        {scoreLabel(selected.score)}
                      </span>
                      <span className={`rounded-md px-2 py-1 text-[11px] font-bold tabular ${selected.snapshot.delta >= 0 ? "bg-sig/10 text-sig" : "bg-cor/10 text-cor"}`}>
                        {selected.snapshot.delta >= 0 ? "▲ +" : "▼ "}{selected.snapshot.delta} п. за квартал
                      </span>
                    </div>
                    <div className="mt-3.5">
                      <div className="flex justify-between text-[11px] text-mut">
                        <span>Выживаемость 1 год</span>
                        <span className="tabular font-semibold text-ink">{selected.survival}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg3">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${selected.survival}%`, background: scoreColor(selected.score) }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* метрики */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ["Выручка / мес", fmtMoney(selected.snapshot.monthly), scoreColor(selected.score)],
                  ["Средний чек", fmtMoney(selected.snapshot.avgCheck), "#e9f4f8"],
                  ["Вложения на старте", fmtMoney(selected.snapshot.startup), "#e9f4f8"],
                  ["Маржинальность", `${selected.snapshot.margin}%`, "#3ce6a4"],
                ].map(([l, v, c], i) => (
                  <div key={l} className="panel-soft rounded-xl p-3.5 anim-rise" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="text-[10px] uppercase tracking-wider text-dim">{l}</div>
                    <div className="mt-1 font-display text-[16px] font-bold tabular" style={{ color: c }}>{v}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* спрос */}
                <div className="panel-soft rounded-xl p-4">
                  <h4 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-mut">Индекс спроса · 12 мес</h4>
                  <AreaChart data={selected.snapshot.demand} color={scoreColor(selected.score)} labels={MONTHS} format={(v) => fmtShort(v)} />
                </div>

                {/* под-баллы */}
                <div className="panel-soft rounded-xl p-4">
                  <h4 className="mb-3 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-mut">Разбор скоринга</h4>
                  <div className="space-y-2.5">
                    {BREAKDOWN_LABELS.map((b, i) => {
                      const v = selected.snapshot.breakdown?.[b.key] ?? 0;
                      return (
                        <div key={b.key}>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-mut">{b.label}</span>
                            <span className="tabular font-semibold text-ink">{v}</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg3">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${v}%`,
                                background: v >= 65 ? "#3ce6a4" : v >= 45 ? "#ffc24b" : "#ff6d6d",
                                transitionDelay: `${i * 70}ms`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[10px] leading-relaxed text-dim">«Конкуренция» и «Вход» — инвертированные: выше балл — легче войти.</p>
                </div>
              </div>

              {/* отчёт */}
              <div className="rounded-xl border border-sig/25 bg-sig/[0.04] p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <h4 className="inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-sig">
                    <ICpu size={14} /> Отчёт по анализу
                  </h4>
                  <span className="rounded border border-line bg-bg2 px-2 py-0.5 text-[10px] font-mono text-mut">
                    {selected.snapshot.report_source === "gigachat" ? "источник: GigaChat" : "источник: эвристика v1"}
                  </span>
                </div>
                <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink/90">
                  {selected.snapshot.report ?? selected.snapshot.insight}
                </p>
              </div>

              {/* действия */}
              <div className="flex flex-wrap gap-3 pb-2">
                <button
                  onClick={() => onOpenNiche(selected.niche_id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-sig px-5 py-2.5 font-display text-[12.5px] font-bold text-bg0 transition hover:brightness-110 active:scale-[0.98]"
                >
                  Открыть на радаре <IArrowR size={15} />
                </button>
                <button
                  onClick={() => remove(selected)}
                  disabled={busyId === selected.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-[12.5px] font-semibold text-mut transition hover:border-cor/50 hover:text-cor disabled:opacity-40"
                >
                  <IX size={14} /> {busyId === selected.id ? "Удаляем…" : "Удалить"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
