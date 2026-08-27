"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Health = {
  status: string;
  version: string;
  database: { path: string; exists: boolean };
  llm: { provider: string; model: string; key_configured: boolean };
};

function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  const [ts, setTs] = useState(0);

  const refresh = useCallback(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    fetch("/api/health", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        setHealth(j as Health);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => clearTimeout(timer));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh, ts]);

  return { health, error, refresh: () => setTs((v) => v + 1) || refresh() };
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const c = ok ? "#3ce6a4" : warn ? "#ffc24b" : "#ff6d6d";
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className="pulse-dot absolute inline-flex h-full w-full rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
    </span>
  );
}

function PipelineNode({
  name,
  port,
  sub,
  accent,
  ok,
  external,
  hidden,
}: {
  name: string;
  port: string;
  sub: string;
  accent: string;
  ok: boolean;
  external?: boolean;
  hidden?: boolean;
}) {
  return (
    <div className="panel group relative flex-1 rounded-xl p-4 transition hover:-translate-y-1 hover:shadow-[0_16px_44px_-18px_rgba(60,230,164,0.35)]">
      <div className="flex items-center justify-between">
        <span className="font-display text-[13px] font-bold" style={{ color: accent }}>
          {name}
        </span>
        <Dot ok={ok} />
      </div>
      <div className="mt-1.5 font-mono text-[11.5px] text-mut">{port}</div>
      <div className="mt-1 text-[11.5px] leading-snug text-dim">{sub}</div>
      <span
        className="absolute -top-2.5 right-3 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
        style={
          external
            ? { borderColor: "#ffc24b55", background: "#ffc24b14", color: "#ffc24b" }
            : { borderColor: "#1c3a54", background: "#0f2334", color: "#8facc0" }
        }
      >
        {external ? "наружу" : hidden ? "скрыт" : "внутри сети"}
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 40 24" className="h-6 w-10 shrink-0 text-sig/60" aria-hidden>
      <line x1="0" y1="12" x2="30" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="7 7" className="dash-flow" />
      <path d="M28 6 L38 12 L28 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-linesoft bg-bg2/60 px-3.5 py-2">
        <span className="font-mono text-[11px] text-mut">{title}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className={`rounded-md border px-2 py-1 text-[10.5px] font-semibold transition ${
            copied ? "border-sig/50 text-sig" : "border-line text-mut hover:border-cy/50 hover:text-cy"
          }`}
        >
          {copied ? "скопировано" : "копировать"}
        </button>
      </div>
      <pre className="overflow-x-auto scroll-slim px-4 py-3.5 font-mono text-[11.5px] leading-relaxed text-ink/90">{code}</pre>
    </div>
  );
}

const MODULES = [
  { k: "Scout", d: "радар ниш и скоринг v1", c: "#3ce6a4" },
  { k: "Matcher", d: "ниша под профиль и бюджет", c: "#4cc9f0" },
  { k: "Finance", d: "юнит-экономика точки", c: "#ffc24b" },
  { k: "Marketplace", d: "CPA-лиды банкам и франшизам", c: "#a78bfa" },
  { k: "AI", d: "GigaChat с fallback на заглушку", c: "#ff8a5c" },
];

export default function Home() {
  const { health, error } = useHealth();
  const apiOk = !error && health?.status === "ok";
  const llmProvider = health?.llm.provider ?? "—";
  const llmLive = llmProvider === "gigachat" && !!health?.llm.key_configured;

  return (
    <div className="mx-auto max-w-5xl px-5 pb-16">
      {/* top bar */}
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-3">
          <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden>
            <circle cx="24" cy="24" r="21" fill="#0f2334" stroke="#1c3a54" />
            <circle cx="24" cy="24" r="13" fill="none" stroke="#1c3a54" />
            <g style={{ transformOrigin: "24px 24px" }} className="spin-slow">
              <line x1="24" y1="24" x2="45" y2="24" stroke="#3ce6a4" strokeWidth="2" strokeLinecap="round" />
            </g>
            <circle cx="24" cy="24" r="2.6" fill="#3ce6a4" />
            <circle cx="32" cy="15" r="2" fill="#ffc24b" />
          </svg>
          <div>
            <div className="font-display text-lg font-extrabold leading-none">
              Biz<span className="text-sig">Radar</span>
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-dim">радар бизнес-ниш</div>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <span
            className="hidden items-center gap-2 rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold sm:inline-flex"
            style={
              apiOk
                ? { borderColor: "#3ce6a444", background: "#3ce6a40f", color: "#3ce6a4" }
                : { borderColor: "#ff6d6d44", background: "#ff6d6d0f", color: "#ff6d6d" }
            }
          >
            <Dot ok={apiOk} />
            {apiOk ? `api ${health!.version} · онлайн` : "api недоступен"}
          </span>
          <Link
            href="/niches"
            className="rounded-lg bg-sig px-4 py-2 font-display text-[12px] font-bold text-bg0 transition hover:brightness-110 active:scale-[0.98]"
          >
            Ниши и отчёты
          </Link>
        </nav>
      </header>

      {/* заголовок-статус */}
      <section className="anim-rise mt-6">
        <p className="font-mono text-[11.5px] text-cy">$ docker compose --env-file .env.production up -d --build</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          Один деплой-юнит. Три контейнера. <span className="text-sig">HTTPS из коробки.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mut">
          BizRadar оценивает привлекательность бизнес-ниш по реальным данным: конкуренты из OpenStreetMap,
          региональная статистика и отчёты GigaChat. Эта страница живёт внутри прод-сборки — статусы ниже
          приходят с бэкенда через внутренний прокси.
        </p>
      </section>

      {/* pipeline */}
      <section className="anim-rise d2 mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.14em] text-mut">Схема трафика</h2>
          <span className="text-[11px] text-dim">браузер видит один домен — бэкенд снаружи не торчит</span>
        </div>
        <div className="panel grid-bg relative overflow-hidden rounded-2xl p-5">
          <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            <PipelineNode
              name="caddy"
              port=":80 / :443 · ACME"
              sub="официальный caddy:2-alpine, сам получает и продлевает сертификат"
              accent="#ffc24b"
              ok
              external
            />
            <Arrow />
            <PipelineNode
              name="frontend"
              port="next :3000"
              sub="Next.js standalone; rewrite /api/* → http://api:8000"
              accent="#4cc9f0"
              ok
            />
            <Arrow />
            <PipelineNode
              name="api"
              port="uvicorn :8000"
              sub="FastAPI · expose, без ports — только из docker-сети"
              accent="#3ce6a4"
              ok={apiOk}
              hidden
            />
            <Arrow />
            <PipelineNode
              name="db-data"
              port="volume → /data/bizradar"
              sub={health ? `SQLite: ${health.database.path}` : "SQLite-файл переживает пересборку"}
              accent="#a78bfa"
              ok={!!health?.database.exists}
            />
          </div>
        </div>
      </section>

      {/* живые статусы */}
      <section className="anim-rise d3 mt-5 grid gap-3 sm:grid-cols-3">
        <div className="panel rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-dim">LLM-провайдер</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Dot ok={llmLive} warn={!llmLive} />
            <span className="font-display text-lg font-bold" style={{ color: llmLive ? "#3ce6a4" : "#ffc24b" }}>
              {llmLive ? "GigaChat · live" : llmProvider === "gigachat" ? "GigaChat · нет ключа" : "заглушка v1"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-dim">
            {health ? (health.llm.key_configured ? "ключ задан в .env.production" : "fallback на эвристику") : "нет данных /api/health"}
          </p>
        </div>
        <div className="panel rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-dim">База данных</div>
          <div className="mt-1.5 font-display text-lg font-bold" style={{ color: health?.database.exists ? "#3ce6a4" : "#ff6d6d" }}>
            {health ? (health.database.exists ? "SQLite на месте" : "файл не найден") : "—"}
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-dim">{health?.database.path ?? "DATABASE_PATH из .env.production"}</p>
        </div>
        <div className="panel rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-dim">HTTPS</div>
          <div className="mt-1.5 font-display text-lg font-bold text-cy">Caddy ACME</div>
          <p className="mt-1 text-[11px] text-dim">сертификат для {$"{SITE_ADDRESS}"} автопродлевается</p>
        </div>
      </section>

      {/* сервисы compose */}
      <section className="anim-rise d3 mt-10">
        <h2 className="mb-3 font-display text-[13px] font-bold uppercase tracking-[0.14em] text-mut">Что внутри юнита</h2>
        <div className="overflow-hidden rounded-xl border border-line">
          {[
            ["api", "build: ./backend", "expose: 8000 — без ports, снаружи недоступен", "#3ce6a4"],
            ["frontend", "build: ./frontend", "expose: 3000 · BACKEND_INTERNAL_URL=http://api:8000", "#4cc9f0"],
            ["caddy", "image: caddy:2-alpine", "ports: 80, 443, 443/udp · Caddyfile из корня", "#ffc24b"],
            ["db-data", "именованный volume", "монтируется в /data/bizradar → bizradar.db", "#a78bfa"],
            [".env.production", "env_file для api", "LLM_* + DATABASE_PATH; SITE_ADDRESS → Caddy", "#ff8a5c"],
          ].map(([name, a, b, c], i) => (
            <div key={name} className={`flex flex-col gap-1 px-4 py-3 transition hover:bg-bg2/50 sm:flex-row sm:items-center sm:gap-4 ${i ? "border-t border-linesoft" : ""}`}>
              <span className="w-36 shrink-0 font-mono text-[12.5px] font-bold" style={{ color: c }}>
                {name}
              </span>
              <span className="w-52 shrink-0 font-mono text-[11.5px] text-mut">{a}</span>
              <span className="text-[12px] text-dim">{b}</span>
            </div>
          ))}
        </div>
      </section>

      {/* команды */}
      <section className="anim-rise d4 mt-10 grid gap-4 lg:grid-cols-3">
        <CodeBlock title="1 · секреты" code={`nano .env.production\n# SITE_ADDRESS=radar.example.com\n# GIGACHAT_AUTH_KEY=MzMz...`} />
        <CodeBlock title="2 · запуск" code={`docker compose \\\n  --env-file .env.production \\\n  up -d --build`} />
        <CodeBlock title="3 · проверка" code={`docker compose ps\ncurl -sI https://radar.example.com \\\n  | head -1`} />
      </section>

      {/* модули */}
      <section className="anim-rise d5 mt-10">
        <h2 className="mb-3 font-display text-[13px] font-bold uppercase tracking-[0.14em] text-mut">Модули платформы</h2>
        <div className="flex flex-wrap gap-2">
          {MODULES.map((m) => (
            <span
              key={m.k}
              className="group inline-flex items-center gap-2.5 rounded-lg border border-line bg-bg1 px-3.5 py-2.5 transition hover:-translate-y-0.5"
              style={{ boxShadow: "inset 3px 0 0 " + m.c }}
            >
              <span className="font-display text-[12.5px] font-bold" style={{ color: m.c }}>
                {m.k}
              </span>
              <span className="text-[11.5px] text-mut">{m.d}</span>
            </span>
          ))}
        </div>
      </section>

      <footer className="mt-14 flex flex-wrap items-center justify-between gap-2 border-t border-linesoft pt-5 text-[11px] text-dim">
        <span>BizRadar · прод-сборка: FastAPI + Next.js + Caddy · данные каталога демонстрационные</span>
        <Link href="/niches" className="font-semibold text-cy transition hover:text-sig">
          → открыть радар ниш
        </Link>
      </footer>
    </div>
  );
}
