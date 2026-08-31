import { useState } from "react";
import { PARTNER_GROUPS } from "../data";
import { IBolt, ICheck, IInfo, IStore } from "./icons";

export function Marketplace({ onToast }: { onToast: (msg: string) => void }) {
  const [tab, setTab] = useState(PARTNER_GROUPS[0].key);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const group = PARTNER_GROUPS.find((g) => g.key === tab)!;

  const send = (id: string, name: string) => {
    if (sent.has(id)) return;
    setSent((s) => new Set(s).add(id));
    onToast(`Заявка партнёру «${name}» отправлена · демо-режим`);
  };

  return (
    <div className="space-y-5">
      {/* CPA banner */}
      <div className="panel relative overflow-hidden rounded-xl p-5">
        <div className="grid-bg absolute inset-0 opacity-60" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex-1">
            <h3 className="font-display text-base font-bold">Маркетплейс — вторая сторона платформы</h3>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-mut">
              Бесплатный анализ приводит начинающих предпринимателей; их намерения (выбранная ниша, город, готовность
              стартовать) становятся целевыми лидами для банков, франчайзеров и подрядчиков. Так крутится маховик BizRadar.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px]">
            {["Анализ", "Намерение", "Лид", "Выплата CPA"].map((s, i) => (
              <span key={s} className="inline-flex items-center gap-2">
                <span className="rounded-md border border-line bg-bg2 px-2.5 py-1.5 font-semibold text-ink">{s}</span>
                {i < 3 && <IBolt size={13} className="text-sig" />}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {PARTNER_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setTab(g.key)}
            className={`rounded-lg border px-4 py-2 font-display text-[12px] font-semibold transition ${
              tab === g.key
                ? "border-sig/60 bg-sig/10 text-sig"
                : "border-line bg-bg1 text-mut hover:border-line hover:bg-bg2 hover:text-ink"
            }`}
          >
            {g.label}
          </button>
        ))}
        <span className="ml-auto hidden text-xs text-dim sm:block">{group.desc}</span>
      </div>

      {/* cards */}
      <div key={tab} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {group.items.map((p, i) => {
          const done = sent.has(p.id);
          return (
            <div
              key={p.id}
              className="panel group rounded-xl p-5 transition hover:-translate-y-1 hover:shadow-[0_14px_40px_-18px_rgba(60,230,164,0.35)] anim-rise"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-lg font-display text-base font-bold"
                  style={{ background: `${p.color}1c`, color: p.color, border: `1px solid ${p.color}40` }}
                >
                  {p.name.replace(/[«»]/g, "").slice(0, 1).toUpperCase()}
                </div>
                <span
                  className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ borderColor: `${p.color}55`, color: p.color, background: `${p.color}12` }}
                >
                  {p.tag}
                </span>
              </div>
              <h4 className="mt-3.5 font-display text-[15px] font-bold leading-tight">{p.name}</h4>
              <p className="mt-1 text-[12.5px] text-mut">{p.offer}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-bg2 px-2.5 py-1 text-[12px] font-semibold tabular" style={{ color: p.color }}>
                <IStore size={13} /> {p.metric}
              </div>
              <button
                onClick={() => send(p.id, p.name)}
                disabled={done}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-bold transition active:scale-[0.98] ${
                  done
                    ? "cursor-default border border-sig/40 bg-sig/10 text-sig"
                    : "border border-line bg-bg2 text-ink hover:border-sig/50 hover:text-sig"
                }`}
              >
                {done ? (
                  <>
                    <ICheck size={15} /> Заявка отправлена
                  </>
                ) : (
                  "Оставить заявку"
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-dim">
        <IInfo size={14} className="mt-0.5 shrink-0 text-cy" />
        Намерения передаются партнёрам только с явного согласия пользователя (чекбокс в форме заявки). Для банков доступен
        скоринг-слой: вероятность открытия бизнеса в течение 60 дней.
      </p>
    </div>
  );
}
