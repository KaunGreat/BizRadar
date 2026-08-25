import { ENDPOINTS, FLYWHEEL, ROADMAP_DONE, ROADMAP_NEXT, STACK } from "../data";
import { ICheck, IClock, ICopy, ILayers, IWallet, IUsers, IBuilding, IBolt } from "./icons";

function Flywheel() {
  const cx = 300;
  const cy = 175;
  const rx = 205;
  const ry = 122;
  const pos = (i: number) => {
    const a = (-90 + (360 / FLYWHEEL.length) * i) * (Math.PI / 180);
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  };
  return (
    <svg viewBox="0 0 600 350" className="w-full h-auto">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#1c3a54" strokeWidth={1.5} strokeDasharray="10 10" className="dash-flow" />
      <ellipse cx={cx} cy={cy} rx={rx - 42} ry={ry - 30} fill="none" stroke="#14293c" strokeWidth={1} />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="13" fill="#3ce6a4" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
        маховик
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#8facc0">
        BizRadar
      </text>
      <circle cx={cx} cy={cy} r={52} fill="none" stroke="#3ce6a4" strokeOpacity={0.25} />
      {FLYWHEEL.map((label, i) => {
        const { x, y } = pos(i);
        const w = label.length * 6.4 + 26;
        return (
          <g key={label} transform={`translate(${x} ${y})`}>
            <rect
              x={-w / 2}
              y={-17}
              width={w}
              height={34}
              rx={8}
              fill="#0f2334"
              stroke={i === 2 ? "#3ce6a4" : "#2a5378"}
              strokeOpacity={i === 2 ? 0.7 : 0.8}
            />
            <text x={0} y={4.5} textAnchor="middle" fontSize="10.5" fill="#e9f4f8" fontWeight={600}>
              {label}
            </text>
            <circle cx={-w / 2 + 10} cy={0} r={2.5} fill={i === 2 ? "#3ce6a4" : "#4cc9f0"} />
          </g>
        );
      })}
    </svg>
  );
}

export function DataView({ onToast }: { onToast: (msg: string) => void }) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast(`Скопировано: ${text}`);
    } catch {
      onToast("Буфер обмена недоступен в этой среде");
    }
  };

  return (
    <div className="space-y-5">
      {/* monetization */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: IUsers, color: "#3ce6a4", t: "Freemium B2C", d: "Бесплатный анализ + платные глубокие отчёты по нишам" },
          { icon: IWallet, color: "#4cc9f0", t: "CPA-лиды банкам", d: "Оплата за открытие счёта приведённым предпринимателем" },
          { icon: ILayers, color: "#a78bfa", t: "API / SaaS франшизам", d: "Скоринг территорий и тепловые карты спроса" },
          { icon: IBuilding, color: "#ffc24b", t: "B2G-лицензии", d: "Региональные программы поддержки предпринимательства" },
        ].map(({ icon: Icon, color, t, d }, i) => (
          <div key={t} className="panel rounded-xl p-4 anim-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <Icon size={20} style={{ color }} />
            <div className="mt-2.5 font-display text-[13px] font-bold">{t}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-mut">{d}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* flywheel */}
        <div className="panel rounded-xl p-5">
          <h3 className="font-display text-sm font-bold">Маховик платформы</h3>
          <p className="mt-1 text-[12.5px] text-mut">Каждый бесплатный анализ делает продукт точнее и дороже для B2B-сторон.</p>
          <div className="mt-3">
            <Flywheel />
          </div>
        </div>

        {/* roadmap */}
        <div className="panel rounded-xl p-5">
          <h3 className="font-display text-sm font-bold">Статус проекта</h3>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-2.5 text-[10px] uppercase tracking-[0.18em] text-sig">Сделано</div>
              <ul className="space-y-2.5">
                {ROADMAP_DONE.map((r) => (
                  <li key={r} className="flex gap-2.5 text-[12.5px] leading-snug text-mut">
                    <ICheck size={15} className="mt-0.5 shrink-0 text-sig" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2.5 text-[10px] uppercase tracking-[0.18em] text-amb">Дальше</div>
              <ul className="space-y-2.5">
                {ROADMAP_NEXT.map((r, i) => (
                  <li key={r} className="flex gap-2.5 text-[12.5px] leading-snug text-mut">
                    {i === 0 ? (
                      <span className="mt-0.5 shrink-0">
                        <IBolt size={15} className="animate-pulse text-amb" />
                      </span>
                    ) : (
                      <IClock size={15} className="mt-0.5 shrink-0 text-amb" />
                    )}
                    <span>
                      {r}
                      {i === 0 && (
                        <span className="ml-1.5 rounded border border-amb/40 bg-amb/10 px-1.5 py-0.5 text-[10px] font-bold text-amb">в работе</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* api + stack */}
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="panel rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold">API модульного монолита</h3>
            <span className="rounded border border-line bg-bg2 px-2 py-0.5 font-mono text-[10.5px] text-cy">FastAPI · SQLite (MVP)</span>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-linesoft">
            {ENDPOINTS.map((e, i) => (
              <div
                key={e.path}
                className={`group flex items-center gap-3 px-3.5 py-2.5 text-[12.5px] transition hover:bg-bg2/60 ${
                  i !== ENDPOINTS.length - 1 ? "border-b border-linesoft" : ""
                }`}
              >
                <span
                  className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-bold ${
                    e.method === "GET" ? "bg-cy/15 text-cy" : "bg-sig/15 text-sig"
                  }`}
                >
                  {e.method}
                </span>
                <code className="shrink-0 font-mono text-[12px] text-ink/90">{e.path}</code>
                <span className="hidden truncate text-[11.5px] text-dim md:block">{e.desc}</span>
                <button
                  onClick={() => copy(`${e.method} ${e.path}`)}
                  className="ml-auto rounded-md border border-line p-1.5 text-mut opacity-60 transition hover:border-cy/50 hover:text-cy group-hover:opacity-100"
                  aria-label="Копировать"
                >
                  <ICopy size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-xl p-5">
          <h3 className="font-display text-sm font-bold">Стек</h3>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {STACK.map((s) => (
              <span key={s} className="rounded-md border border-line bg-bg2 px-2.5 py-1.5 text-[11.5px] text-mut transition hover:border-cy/50 hover:text-ink">
                {s}
              </span>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-vio/25 bg-vio/[0.06] p-3.5">
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-vio">ИИ-слой</div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mut">
              <code className="font-mono text-[11px] text-ink">RussianLLMService</code> — абстракция над GigaChat
              (приоритет) и YandexGPT. Реальный вызов уже реализован: без ключа или при сбое сервис автоматически
              откатывается на заглушку — эндпоинт не падает. Подробнее — во вкладке «ИИ-слой».
            </p>
          </div>
          <div className="mt-4 rounded-lg panel-soft p-3.5 text-[12px] leading-relaxed text-mut">
            <span className="font-semibold text-ink">Прототип фронтенда.</span> Визуализирует контракт данных бэкенда:
            скоринг, снимки рынка (TTL 7 дней), точки Overpass API и CPA-сценарии маркетплейса.
          </div>
        </div>
      </div>
    </div>
  );
}
