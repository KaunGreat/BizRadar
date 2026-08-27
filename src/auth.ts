/**
 * Личный кабинет: клиент аутентификации.
 *
 * Работает против реального бэкенда (POST /api/auth/register|login, GET /me).
 * Если бэкенд недоступен (чистый демо-стенд без API), включается demo-режим:
 * аккаунт и токен живут в localStorage, чтобы интерфейс кабинета и «Мои
 * анализы» оставались полностью кликабельными. Режим виден по флагу demo.
 *
 * Токен хранится в localStorage и автоматически подставляется в каждый
 * запрос через apiFetch(). Ответ 401 чистит сессию и шлёт событие
 * "bizradar:unauthorized" — приложение перехватывает его и редиректит на вход.
 */

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  demo: boolean;
}

const TOKEN_KEY = "bizradar-token-v1";
const USER_KEY = "bizradar-user-v1";
const DEMO_KEY = "bizradar-auth-demo-v1";

export const UNAUTHORIZED_EVENT = "bizradar:unauthorized";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ хранение ------------------------------ */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredSession(): AuthSession | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    if (!token || !raw) return null;
    const user = JSON.parse(raw) as AuthUser;
    return { user, token, demo: localStorage.getItem(DEMO_KEY) === "1" };
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser, demo = false): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(DEMO_KEY, demo ? "1" : "0");
  } catch {
    /* приватный режим — сессия проживёт до перезагрузки */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* noop */
  }
}

function notifyUnauthorized(): void {
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

/* --------------------------- универсальный fetch --------------------------- */
/**
 * fetch с автоподстановкой Bearer-токена. Ответ 401 (токен протух/отозван)
 * чистит сессию и уведомляет приложение — дальше следует редирект на вход.
 */
export async function apiFetch(url: string, init: RequestInit = {}, ms = 4000): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    if (res.status === 401 && token) {
      clearSession();
      notifyUnauthorized();
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- операции ------------------------------- */
async function tryJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Текст ошибки из { detail } FastAPI, иначе — общая формулировка. */
function errorMessage(body: Record<string, unknown>, fallback: string): string {
  const d = body.detail;
  return typeof d === "string" && d ? d : fallback;
}

/**
 * Вход. Возвращает сессию или бросает Error с человекочитаемым сообщением.
 * При недоступном бэкенде — demo-сессия (помечена demo=true).
 */
export async function login(email: string, password: string): Promise<AuthSession> {
  try {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await tryJson(res);
    if (!res.ok) throw new Error(errorMessage(body, "Не удалось войти. Проверьте e-mail и пароль."));
    const session: AuthSession = {
      user: body.user as AuthUser,
      token: String(body.access_token ?? ""),
      demo: false,
    };
    saveSession(session.token, session.user, false);
    return session;
  } catch (e) {
    // Сеть недоступна (демо-стенд) — включаем demo-режим, если это не ошибка валидации.
    if (e instanceof TypeError || (e instanceof Error && e.name === "AbortError")) {
      return demoSession(email);
    }
    throw e;
  }
}

/** Регистрация + автоматический вход. */
export async function register(email: string, password: string, name: string): Promise<AuthSession> {
  try {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const body = await tryJson(res);
    if (!res.ok) throw new Error(errorMessage(body, "Не удалось создать аккаунт."));
    // Бэкенд отдает 201 без токена — сразу входим.
    return await login(email, password);
  } catch (e) {
    if (e instanceof TypeError || (e instanceof Error && e.name === "AbortError")) {
      return demoSession(email, name);
    }
    throw e;
  }
}

/** Выход: отзыв токена на сервере (best effort) + очистка локальной сессии. */
export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" }, 1500);
    } catch {
      /* сервер недоступен — всё равно чистим локально */
    }
  }
  clearSession();
}

/** Актуализировать профиль по токену (GET /api/auth/me). */
export async function refreshMe(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) return null;
    const user = (await res.json()) as AuthUser;
    saveSession(token, user, false);
    return user;
  } catch {
    return null;
  }
}

/* ------------------------------ demo-режим ------------------------------ */
function demoSession(email: string, name?: string): AuthSession {
  // небольшая задержка, чтобы форма успела показать состояние загрузки
  const user: AuthUser = {
    id: 0,
    email: email.toLowerCase(),
    name: name || email.split("@")[0],
    role: "user",
    status: "active",
    created_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  };
  const token = `demo.${btoa(email)}.${Date.now()}`;
  saveSession(token, user, true);
  return { user, token, demo: true };
}
