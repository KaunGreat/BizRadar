/**
 * История анализов: клиент. Сначала пробуем реальный бэкенд
 * (GET/POST/DELETE /api/v1/projects), при недоступности — localStorage,
 * чтобы раздел работал и в чистом демо-режиме. Форма данных одинаковая.
 */

export interface ProjectSnapshot {
  category?: string;
  breakdown?: { demand: number; competition: number; margin: number; entry: number; trend: number };
  score: number;
  delta: number;
  monthly: number;
  margin: number;
  startup: number;
  avgCheck: number;
  survival: number;
  demand: number[];
  tags: string[];
  insight: string;
  report?: string;
  report_source?: "gigachat" | "stub";
}

export interface ProjectRecord {
  id: number | string;
  niche_id: string;
  niche_title: string;
  city: string;
  city_name: string;
  score: number;
  survival: number;
  has_report: boolean;
  created_at: string;
  snapshot: ProjectSnapshot;
}

export interface ProjectCreatePayload {
  niche_id: string;
  niche_title: string;
  city: string;
  city_name: string;
  score: number;
  survival: number;
  snapshot: ProjectSnapshot;
}

import { apiFetch } from "./auth";

const LS_KEY = "bizradar-projects-v1";

/* ---------------- localStorage (демо-хранилище) ---------------- */
function lsRead(): ProjectRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as ProjectRecord[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function lsWrite(items: ProjectRecord[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, 100)));
  } catch {
    /* переполнение хранилища не должно ломать UI */
  }
}

/* ------------------------- публичный API ------------------------- */
export async function loadProjects(): Promise<{ items: ProjectRecord[]; source: "api" | "local" }> {
  try {
    const res = await apiFetch("/api/v1/projects");
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { items: ProjectRecord[] };
    return { items: j.items ?? [], source: "api" };
  } catch {
    const items = lsRead().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { items, source: "local" };
  }
}

export async function saveProject(p: ProjectCreatePayload): Promise<{ id: number | string; source: "api" | "local" }> {
  try {
    const res = await apiFetch("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { id: number; created_at: string };
    // дублируем в локальную копию, чтобы демо-список совпадал при смешанных режимах
    const items = lsRead();
    items.unshift({ ...p, id: j.id, has_report: !!p.snapshot.report, created_at: j.created_at });
    lsWrite(items);
    return { id: j.id, source: "api" };
  } catch {
    const items = lsRead();
    const rec: ProjectRecord = {
      ...p,
      id: `ls-${Date.now()}`,
      has_report: !!p.snapshot.report,
      created_at: new Date().toISOString(),
    };
    items.unshift(rec);
    lsWrite(items);
    return { id: rec.id, source: "local" };
  }
}

export async function deleteProject(id: number | string): Promise<void> {
  // серверная запись
  if (typeof id === "number" || !String(id).startsWith("ls-")) {
    try {
      await apiFetch(`/api/v1/projects/${id}`, { method: "DELETE" });
    } catch {
      /* нет бэкенда — удалим только локальную копию */
    }
  }
  lsWrite(lsRead().filter((r) => String(r.id) !== String(id)));
}

export const formatDate = (iso: string): string => {
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
