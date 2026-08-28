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

/**
 * Классифицированная ошибка аутентификации:
 *  - "http"    — сервер ответил осмысленно (401 неверный пароль, 409 занят, 429 лимит…);
 *  - "network" — бэкенд недоступен/не найден (сеть, 404, 502/504): форме есть
 *                что показать («запустите сервер» + демо-режим).
 */
export class AuthError extends Error {
  kind: "network" | "http";
  status?: number;
  constructor(message: string, kind: "network" | "http", status?: number) {
    super(message);
    this.name = "AuthError";
    this.kind = kind;
    this.status = status;
  }
}

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
    // 401 на самих auth-эндпоинтах (неверный пароль при входе) — это НЕ «сессия
    // истекла»: не чистим хранилище и не редиректим, форму обработает ответ сама.
    if (res.status === 401 && token && !url.startsWith("/api/auth/")) {
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

/** Текст ошибки из { detail } FastAPI (строка), иначе null. */
function detailText(body: Record<string, unknown>): string | null {
  const d = body.detail;
  return typeof d === "string" && d ? d : null;
}

const NETWORK_STATUSES = new Set([404, 502, 503, 504]);

const HTTP_MESSAGES: Record<number, string> = {
  401: "Неверный e-mail или пароль.",
  403: "Аккаунт заблокирован. Обратитесь в поддержку.",
  409: "Пользователь с таким e-mail уже зарегистрирован — переключитесь на «Вход».",
  422: "Сервер отклонил данные: проверьте формат e-mail и длину пароля (от 8 символов).",
  429: "Слишком много попыток входа. Подождите минуту и попробуйте снова.",
};

/**
 * Единая обработка неуспешного ответа: различаем «бэкенд не найден/лежит»
 * (network — форме показываем запуск сервера и демо-режим) и осмысленные
 * HTTP-ошибки (http — точное сообщение пользователю).
 */
function throwForStatus(res: Response, body: Record<string, unknown>): never {
  const detail = detailText(body);
  if (!detail && NETWORK_STATUSES.has(res.status)) {
    throw new AuthError(
      "Бэкенд не отвечает: эндпоинт аутентификации не найден или сервер недоступен. " +
        "Запустите API (cd backend && uvicorn main:app --port 8000) — или войдите в демо-режим ниже.",
      "network",
      res.status
    );
  }
  throw new AuthError(detail || HTTP_MESSAGES[res.status] || `Сервер вернул ошибку ${res.status}.`, "http", res.status);
}

/**
 * Вход. Возвращает сессию либо бросает AuthError с человекочитаемым сообщением:
 * «неверный пароль», «e-mail занят», «лимит попыток», «сервис недоступен» и т.д.
 */
export async function login(email: string, password: string): Promise<AuthSession> {
  let res: Response;
  try {
    res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (e) {
    // fetch упал сам: нет сети, CORS, таймаут — бэкенд недоступен.
    throw new AuthError(
      "Не удалось связаться с сервером. Проверьте, запущен ли бэкенд (uvicorn main:app --port 8000), — или войдите в демо-режим ниже.",
      "network"
    );
  }
  const body = await tryJson(res);
  if (!res.ok) throwForStatus(res, body);
  const token = String(body.access_token ?? "");
  if (!token || !body.user) {
    throw new AuthError("Сервер вернул некорректный ответ (нет токена). Обновите страницу и попробуйте снова.", "http", res.status);
  }
  const session: AuthSession = { user: body.user as AuthUser, token, demo: false };
  saveSession(session.token, session.user, false);
  return session;
}

/** Регистрация + автоматический вход. */
export async function register(email: string, password: string, name: string): Promise<AuthSession> {
  let res: Response;
  try {
    res = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
  } catch {
    throw new AuthError(
      "Не удалось связаться с сервером. Проверьте, запущен ли бэкенд, — или войдите в демо-режим ниже.",
      "network"
    );
  }
  const body = await tryJson(res);
  if (!res.ok) throwForStatus(res, body);
  // Бэкенд отдаёт 201 без токена — сразу входим (ошибки входа пробрасываются как есть).
  return await login(email, password);
}

/** Явный вход в демо-режим (бэкенд недоступен): сессия живёт в localStorage. */
export function enterDemoMode(email: string, name?: string): AuthSession {
  return demoSession(email, name);
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
